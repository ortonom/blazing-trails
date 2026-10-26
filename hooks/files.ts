import type { EngineInterface } from 'claude-code'

// A file's text, or null when it cannot be read.
export async function readText($: EngineInterface, path: string) {
  try {
    return String(await $.fs.read(path))
  } catch {
    return null
  }
}
