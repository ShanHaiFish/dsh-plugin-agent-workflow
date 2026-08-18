/** Package-owned invariant companion. @module dsh-plugin-agent-workflow/invariant */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = 'dsh-plugin-agent-workflow'
/** Cordis companion plugin name. */
export const name = 'client-ui-workflow-invariant'
/** Required invariant registry. */
export const inject = ['invariants']
/** No runtime invariant: the owned projection is replay-derived and has no durable relationship to assert. */
const install: InvariantInstaller = () => {}
/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
