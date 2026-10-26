// 간단한 로그. LOG_LEVEL=debug|info|warn|error (기본 info)
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const current = LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? 20;

function out(level, args) {
  if (LEVELS[level] < current) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const log = {
  debug: (...a) => out('debug', a),
  info: (...a) => out('info', a),
  warn: (...a) => out('warn', a),
  error: (...a) => out('error', a),
};
