import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { findAvailablePort, startUpstreamMock, spawnProxyProcess, stopChild } from './utils.js'

function parseSSE(text) {
  const events = []
  const lines = text.split(/\r?\n/)
  let cur = { event: 'message', data: '' }
  for (const line of lines) {
    if (line.startsWith('event: ')) cur.event = line.slice(7).trim()
    else if (line.startsWith('data: ')) cur.data = line.slice(6)
    else if (line.trim() === '') {
      if (cur.data) events.push({ ...cur });
      cur = { event: 'message', data: '' }
    }
  }
  return events
}

describe('POST /v1/messages (streaming tool calls)', () => {
  it('maps OpenAI tool_calls deltas to Anthropic tool_use content blocks', async () => {
    const chunks = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_weather', arguments: '{"city":"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_weather', arguments: '{"city":"SF"}' } }] } }] },
    ]
    const upstream = await startUpstreamMock({ mode: 'sse', sseChunks: chunks })
    const proxyPort = 3113
    const child = await spawnProxyProcess({
      port: proxyPort,
      baseUrl: `http://127.0.0.1:${upstream.port}`,
      env: { CUSTOM_API_KEY: 'testkey' },
    })

    try {
      const res = await request(`http://127.0.0.1:${proxyPort}`)
        .post('/v1/messages')
        .set('content-type', 'application/json')
        .buffer(true)
        .parse((res, cb) => {
          res.setEncoding('utf8')
          let data = ''
          res.on('data', (d) => (data += d))
          res.on('end', () => cb(null, data))
        })
        .send({ messages: [{ role: 'user', content: 'Say hi' }], stream: true })
        .expect(200)

      const raw = res.text ?? res.body
      const events = parseSSE(raw)
      const start = events.find((e) => e.event === 'content_block_start')
      expect(start).toBeTruthy()
      const startPayload = JSON.parse(start.data)
      expect(startPayload.content_block.type).toBe('tool_use')
      expect(startPayload.content_block.name).toBe('get_weather')

      const deltas = events
        .filter((e) => e.event === 'content_block_delta')
        .map((e) => JSON.parse(e.data))
      const jsonPieces = deltas.map((d) => d.delta.partial_json).join('')
      expect(jsonPieces).toBe('{"city":"SF"}')

      const lastDelta = events[events.length - 2] // message_delta
      const md = JSON.parse(lastDelta.data)
      expect(md.delta.stop_reason).toBe('tool_use')
    } finally {
      await stopChild(child)
      upstream.server.close()
    }
  })

  it('assigns tool calls a unified content block index after thinking blocks', async () => {
    const chunks = [
      { choices: [{ delta: { reasoning_content: 'Think first.' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_weather', arguments: '{"city":"SF"}' } }] } }] },
    ]
    const upstream = await startUpstreamMock({ mode: 'sse', sseChunks: chunks })
    const proxyPort = await findAvailablePort()
    const child = await spawnProxyProcess({
      port: proxyPort,
      baseUrl: `http://127.0.0.1:${upstream.port}`,
      env: { CUSTOM_API_KEY: 'testkey' },
    })

    try {
      const res = await request(`http://127.0.0.1:${proxyPort}`)
        .post('/v1/messages')
        .set('content-type', 'application/json')
        .buffer(true)
        .parse((res, cb) => {
          res.setEncoding('utf8')
          let data = ''
          res.on('data', (d) => (data += d))
          res.on('end', () => cb(null, data))
        })
        .send({ messages: [{ role: 'user', content: 'Use a tool' }], stream: true })
        .expect(200)

      const raw = res.text ?? res.body
      const events = parseSSE(raw)
      const starts = events
        .filter((e) => e.event === 'content_block_start')
        .map((e) => JSON.parse(e.data))
      const thinkingStart = starts.find((e) => e.content_block.type === 'thinking')
      const toolStart = starts.find((e) => e.content_block.type === 'tool_use')

      expect(thinkingStart.index).toBe(0)
      expect(toolStart.index).toBe(1)
    } finally {
      await stopChild(child)
      upstream.server.close()
    }
  })

  it('uses routed upstream model for mixed-provider OpenAI-compatible requests', async () => {
    const upstream = await startUpstreamMock({ mode: 'json' })
    const proxyPort = await findAvailablePort()
    const mixedProviders = {
      reasoning: {
        providerId: 'openai',
        baseUrl: `http://127.0.0.1:${upstream.port}/v1`,
        key: 'openai-key',
        model: 'gpt-4o',
        displayModel: 'openai/gpt-4o',
        endpointKind: 'openai',
      },
      completion: {
        providerId: 'openai',
        baseUrl: `http://127.0.0.1:${upstream.port}/v1`,
        key: 'openai-key',
        model: 'gpt-4o-mini',
        displayModel: 'openai/gpt-4o-mini',
        endpointKind: 'openai',
      },
      value: {
        providerId: 'openai',
        baseUrl: `http://127.0.0.1:${upstream.port}/v1`,
        key: 'openai-key',
        model: 'gpt-4.1-mini',
        displayModel: 'openai/gpt-4.1-mini',
        endpointKind: 'openai',
      },
    }
    const child = await spawnProxyProcess({
      port: proxyPort,
      baseUrl: `http://127.0.0.1:${upstream.port}`,
      isolateEnv: true,
      env: {
        MIXED_PROVIDERS_CONFIG: JSON.stringify(mixedProviders),
      },
    })

    try {
      await request(`http://127.0.0.1:${proxyPort}`)
        .post('/v1/messages')
        .set('content-type', 'application/json')
        .send({
          model: 'openai/gpt-4o',
          messages: [{ role: 'user', content: 'Say hi' }],
          stream: false,
        })
        .expect(200)

      const forwarded = JSON.parse(upstream.received.body)
      expect(upstream.received.url).toBe('/v1/chat/completions')
      expect(forwarded.model).toBe('gpt-4o')
    } finally {
      await stopChild(child)
      upstream.server.close()
    }
  })
})
