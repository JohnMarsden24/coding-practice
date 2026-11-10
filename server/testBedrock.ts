import { crc32 } from 'node:zlib';

/** One frame of AWS's binary event stream, the format Bedrock streams replies in. */
function frame(payload: unknown): Buffer {
  const headers = Buffer.concat(
    Object.entries({ ':event-type': 'chunk', ':message-type': 'event', ':content-type': 'application/json' }).map(([name, value]) => {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(Buffer.byteLength(value));
      return Buffer.concat([Buffer.from([name.length]), Buffer.from(name), Buffer.from([7]), length, Buffer.from(value)]);
    }),
  );
  const body = Buffer.from(JSON.stringify({ bytes: Buffer.from(JSON.stringify(payload)).toString('base64') }));
  const prelude = Buffer.alloc(8);
  prelude.writeUInt32BE(16 + headers.length + body.length, 0);
  prelude.writeUInt32BE(headers.length, 4);
  const preludeCrc = Buffer.alloc(4);
  preludeCrc.writeUInt32BE(crc32(prelude));
  const message = Buffer.concat([prelude, preludeCrc, headers, body]);
  const messageCrc = Buffer.alloc(4);
  messageCrc.writeUInt32BE(crc32(message));
  return Buffer.concat([message, messageCrc]);
}

export function bedrockReply(text: string, tools: { name: string; input: unknown }[] = []): Response {
  const events = [
    {
      type: 'message_start',
      message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'test', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...text.split(/(?<= )/).map((part) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } })),
    { type: 'content_block_stop', index: 0 },
    ...tools.flatMap((tool, i) => [
      { type: 'content_block_start', index: i + 1, content_block: { type: 'tool_use', id: `tool_${i}`, name: tool.name, input: {} } },
      { type: 'content_block_delta', index: i + 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } },
      { type: 'content_block_stop', index: i + 1 },
    ]),
    { type: 'message_delta', delta: { stop_reason: tools.length ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return new Response(Buffer.concat(events.map(frame)), { headers: { 'content-type': 'application/vnd.amazon.eventstream' } });
}
