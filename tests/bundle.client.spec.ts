import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('standalone Workflow bundle', () => {
  it('declares one patch row that mounts Workflow without Trajectory', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as {
      dsh?: { bundle?: { patch?: string }; client?: { platform?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh?.client?.platform).toBe('web')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as { insert?: { id?: string; name?: string }[] }[]
    expect(parsed).toEqual([{ insert: [{
      id: 'ui-workflow',
      name: 'dsh-plugin-agent-workflow',
    }] }])
    expect(JSON.stringify(parsed)).not.toContain('trajectory')
  })
})
