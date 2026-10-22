// Node test-only loader for the repository's extensionless TypeScript imports.
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) } catch (error) {
      if (!specifier.startsWith('.') || !['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(error.code)) throw error
      for (const suffix of ['.ts', '/index.ts']) {
        try { return nextResolve(specifier + suffix, context) } catch {}
      }
      throw error
    }
  },
  load(url, context, nextLoad) {
    if (!url.endsWith('.ts') || !url.startsWith('file:')) return nextLoad(url, context)
    const source = ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
    }).outputText
    return { format: 'module', source, shortCircuit: true }
  }
})
