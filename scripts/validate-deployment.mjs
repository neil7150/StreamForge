import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const cache = resolve(root, '.cache/deployment-check')
mkdirSync(cache, { recursive: true })
const emptyEnv = resolve(cache, 'empty.env')
writeFileSync(emptyEnv, '')
const installedDocker = process.platform === 'win32' ? resolve(process.env.ProgramFiles || 'C:/Program Files', 'Docker/Docker/resources/bin/docker.exe') : 'docker'
const docker = process.env.STREAMFORGE_DOCKER || (existsSync(installedDocker) && statSync(installedDocker).size > 0 ? installedDocker : 'docker')
// Validate templates with disposable placeholders, never print a resolved secret-bearing config.
const env = { ...process.env, POSTGRES_PASSWORD:'a'.repeat(64), JWT_SECRET:'b'.repeat(64), TLS_CERT_DIR:cache }
delete env.COMPOSE_PROFILES
function config(file, overrides = {}, additionalFiles = []) {
  return spawnSync(docker, ['compose','--env-file',emptyEnv,'-f',file,...additionalFiles.flatMap(path=>['-f',path]),'config','--format','json'], {
    cwd:root, env:{...env,...overrides}, encoding:'utf8', timeout:30000
  })
}
for (const file of ['docker-compose.yml','compose.staging.yml']) {
  const result = config(`deployments/docker-compose/${file}`)
  if (result.error || result.status !== 0) throw new Error(`Compose validation failed for ${file}; Docker Compose CLI is required (daemon is not required).`)
  const parsed = JSON.parse(result.stdout)
  assert.match(JSON.stringify(parsed.services['auth-redis'].command), /noeviction/)
  assert.match(parsed.services['auth-service'].environment.REDIS_URL, /auth-redis/)
  for (const name of ['content-service','user-service']) assert.match(parsed.services[name].environment.AUTH_REDIS_URL, /auth-redis/)
  for (const [name, service] of Object.entries(parsed.services)) {
    for (const port of service.ports || []) {
      if (file === 'compose.staging.yml') { assert.equal(name,'nginx'); assert.equal(Number(port.published),443) }
      else assert.equal(port.host_ip,'127.0.0.1')
    }
  }
  if (file === 'compose.staging.yml') {
    assert.equal(parsed.services['search-service'].depends_on['content-service'].condition,'service_healthy')
    for (const missing of ['POSTGRES_PASSWORD','JWT_SECRET','TLS_CERT_DIR']) assert.notEqual(config(`deployments/docker-compose/${file}`,{[missing]:''}).status,0,`${missing} must be required`)
  }
  console.log(`PASS ${file}: Compose parsing, Redis isolation, port exposure and required staging configuration`)
}
const verification = config('deployments/docker-compose/compose.staging.yml',{},['deployments/docker-compose/compose.verify.yml'])
assert.equal(verification.status,0,'Container verification overlay must parse.')
const verifyPorts = JSON.parse(verification.stdout).services.nginx.ports
assert.equal(verifyPorts.length,1)
assert.equal(verifyPorts[0].host_ip,'127.0.0.1')
console.log('PASS real-container verification overlay: gateway is bound only to loopback.')
if (!process.argv.includes('--config-only')) {
  for (const service of ['auth','content','search','user']) {
    const tests = spawnSync('go',['test','-mod=readonly','-timeout=90s','./...'], {
      cwd:resolve(root,'services',service), stdio:'inherit', timeout:120000,
      env:{...process.env, GOWORK:'off', CGO_ENABLED:'0'}
    })
    if (tests.error || tests.status !== 0) throw new Error(`Standalone service tests failed: ${service}`)
    const result = spawnSync('go',['build','-mod=readonly','-trimpath','-o',resolve(cache,service), './cmd/server'], {
      cwd:resolve(root,'services',service), stdio:'inherit', timeout:180000,
      env:{...process.env, GOWORK:'off', CGO_ENABLED:'0', GOOS:'linux', GOARCH:'amd64'}
    })
    if (result.error || result.status !== 0) throw new Error(`Standalone Linux build failed: ${service}`)
    console.log(`PASS ${service}: standalone Linux backend compilation`)
  }
}
console.log('Deployment source checks passed. Container startup, real Redis, Nginx TLS and public staging checks are separate. No Android artifact was built.')
