import type { ReadStream, WriteStream } from 'node:tty';

/** Local TTY-only input. Never prints entered characters, even when reporting a validation failure. */
export function readHiddenPassword(prompt: string, input: ReadStream = process.stdin, output: WriteStream = process.stdout): Promise<string> {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Administrator setup requires an interactive terminal. Piped input and redirected output are not accepted.');
  }
  return new Promise((resolve, reject) => {
    const wasRaw = Boolean(input.isRaw);
    // A fresh TTY has readableFlowing=null while isPaused() is false. Restore
    // only an already-flowing stream; otherwise our resume() keeps the CLI alive.
    const wasFlowing = input.readableFlowing === true;
    const characters: string[] = [];
    let overflow = false;
    let escapeSequence = false;
    let done = false;
    const cleanup = () => {
      input.off('data', onData);
      input.off('error', onError);
      input.off('end', onEnd);
      input.setRawMode(wasRaw);
      if (!wasFlowing) input.pause();
      output.write('\n');
    };
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      cleanup();
      const value = characters.join('');
      characters.fill('');
      if (error) reject(error);
      else if (overflow) reject(new Error('Password input exceeded 128 characters. No password was saved. Please retry.'));
      else resolve(value);
    };
    const onError = () => finish(new Error('Unable to read terminal input. No password was saved.'));
    const onEnd = () => finish(new Error('Terminal input ended. No password was saved.'));
    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const character of text) {
        if (character === '\u0003') { finish(new Error('Administrator setup cancelled. No password was saved.')); return; }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (escapeSequence) { if (/[A-Za-z~]/.test(character)) escapeSequence = false; continue; }
        if (character === '\u001b') { escapeSequence = true; continue; }
        if (character === '\u007f' || character === '\b') { characters.pop(); continue; }
        if (character === '\u0015') { characters.length = 0; overflow = false; continue; }
        if (character.codePointAt(0)! < 32) continue;
        if (characters.length >= 128) { overflow = true; continue; }
        characters.push(character);
      }
    };
    output.write(prompt);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.on('data', onData);
    input.once('error', onError);
    input.once('end', onEnd);
    input.resume();
  });
}
