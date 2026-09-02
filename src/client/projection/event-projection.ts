/**
 * Workflow-owned conversions from durable Session events to view data.
 *
 * alpha.4 removed the shared runtime helper exports
 * (`@deepseek-ai/dsh-client-runtime/client`) and client bundles must not
 * value-import another plugin's module, so this plugin carries its own copies
 * of the block/provenance classifiers — exactly like Chat and Trajectory do.
 * The implementations match the alpha.4 trajectory/chat projections.
 */
import type {
  AssistantBlock, ContextProvenanceView, KnownContextForm,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ContentBlock, StreamChunk } from '@deepseek-ai/dsh-llm/types'

/** One durable source narrowed to the readable-record shape; null for anything else. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** A record field read as a non-empty string, or null. */
function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Distinct non-empty `field` values of an array-valued source member, in first-seen order. */
function collect(
  source: Record<string, unknown>,
  member: string,
  field: string,
): string[] {
  const list = source[member]
  if (!Array.isArray(list)) return []
  const seen: string[] = []
  for (const entry of list) {
    const record = asRecord(entry)
    const value = record === null ? null : readString(record, field)
    if (value !== null && !seen.includes(value)) seen.push(value)
  }
  return seen
}

/** A collected name list rendered as one label; null when the list is empty. */
function joined(names: readonly string[]): string | null {
  return names.length > 0 ? names.join(', ') : null
}

/** Context forms this UI version presents; anything else degrades to opaque. */
const KNOWN_FORMS: readonly KnownContextForm[] = [
  'instructions', 'catalog', 'snapshot', 'notice', 'relay', 'recall',
]

/**
 * Read the producer-declared form off one durable message source.
 * @param source - The logged `user/message` source, exactly as recorded.
 * @returns The form when this UI version presents it, otherwise null (opaque).
 */
export function contextForm(source: unknown): KnownContextForm | null {
  const record = asRecord(source)
  const form = record === null ? null : readString(record, 'form')
  return form !== null && (KNOWN_FORMS as readonly string[]).includes(form)
    ? form as KnownContextForm
    : null
}

/**
 * Project a durable message source to the row's role and producer label.
 * @param source - Logged `user/message` source.
 * @returns Role and label rendered by the Workflow target.
 */
export function contextProvenance(source: unknown): ContextProvenanceView {
  const record = asRecord(source)
  const kind = record === null ? null : readString(record, 'kind')
  if (record === null || kind === null) return { role: 'inject', label: null }
  switch (kind) {
    case 'session-reference': return {
      role: 'recall',
      label: joined(collect(record, 'references', 'label')) ?? kind,
    }
    case 'agent-instructions': return {
      role: 'inject',
      label: joined(collect(record, 'changes', 'path')) ?? kind,
    }
    case 'plugin': return {
      role: 'inject',
      label: readString(record, 'plugin') ?? kind,
    }
    case 'skill-invocation': return {
      role: 'inject',
      label: readString(record, 'name') ?? kind,
    }
    default: return { role: 'inject', label: kind }
  }
}

/**
 * Classify finalized Assistant content for the Workflow target.
 * @param content - Core content blocks.
 * @returns Workflow blocks in source order.
 */
export function toAssistantBlocks(content: readonly ContentBlock[]): AssistantBlock[] {
  return content.map(toAssistantBlock)
}

/**
 * Classify one finalized Assistant block for the Workflow target.
 * @param block - Core content block.
 * @returns Workflow block.
 */
export function toAssistantBlock(block: ContentBlock): AssistantBlock {
  switch (block.type) {
    case 'text': return { kind: 'text', text: block.text }
    case 'reasoning': return { kind: 'reasoning', text: block.text }
    case 'image': return { kind: 'image', attachment: block.attachment }
    case 'tool-call': return {
      kind: 'tool-call',
      callId: String(block.id),
      name: block.name,
      argsRaw: block.arguments,
    }
    default: return { kind: 'other', block }
  }
}

/**
 * Create the initial Workflow block for one streamed Assistant block kind.
 * @param blockType - Wire block kind.
 * @returns Empty block ready to receive deltas.
 */
export function emptyAssistantBlock(blockType: string): AssistantBlock {
  switch (blockType) {
    case 'text': return { kind: 'text', text: '' }
    case 'reasoning': return { kind: 'reasoning', text: '' }
    case 'tool-call': return { kind: 'tool-call', callId: '', name: '', argsRaw: '' }
    default: return { kind: 'other', block: null }
  }
}

/**
 * Whether a stream chunk carries visible model output (the shared first-token
 * boundary). Empty deltas (heartbeats, empty tool-call frames) do not count.
 * @param chunk - the stream chunk to test.
 * @returns true when the chunk contains a non-empty text/reasoning/tool delta.
 */
export function isTokenDelta(chunk: StreamChunk): boolean {
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta': return chunk.text !== ''
    case 'tool-call-delta': return chunk.argumentsDelta !== '' || chunk.name !== undefined
    default: return false
  }
}

/**
 * Convert a durable failure into copy that is safe to expose in the GUI.
 * @param failure - Failure value preserved by a Session event.
 * @returns Display-safe message for client projections.
 */
export function displayFailureMessage(failure: unknown): string {
  if (failure === null || typeof failure !== 'object') return String(failure)
  const record = failure as Record<string, unknown>
  if (record.code === 'AUTH') return 'API key is invalid'
  return typeof record.message === 'string' ? record.message : JSON.stringify(failure)
}