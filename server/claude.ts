import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import Anthropic from '@anthropic-ai/sdk';

export type Claude = AnthropicBedrock;

export const models = {
  chat: process.env.CHAT_MODEL || 'eu.anthropic.claude-sonnet-5-5',
  deep: process.env.DEEP_MODEL || 'eu.anthropic.claude-opus-5-5',
};

/**
 * Uses the same Bedrock settings as Claude Code: ANTHROPIC_BEDROCK_BASE_URL and AWS_REGION
 * are read by the SDK, and CLAUDE_CODE_SKIP_BEDROCK_AUTH means a gateway handles auth.
 */
export function createClaude(): Claude {
  const skip = process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH;
  return new AnthropicBedrock({ skipAuth: Boolean(skip && skip !== '0' && skip !== 'false') });
}

export function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach Claude. Check your network or VPN and try again.";
  }
  if (error instanceof Anthropic.RateLimitError) return 'Claude is rate limited right now. Give it a moment and try again.';
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return 'Claude rejected the credentials. Check the Bedrock settings Claude Code uses in your shell.';
  }
  if (error instanceof Anthropic.APIError) return `Claude returned an error (${error.status ?? 'unknown'}): ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
