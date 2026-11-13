import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { resolve, dirname } from "node:path";

// Test-only transport capture. No debug endpoint is added to the application.
// All three containers share a new network-none namespace with no public ports.
const [project, nodeImage, privateDirectory] = process.argv.slice(2);
assert(/^fluivixedu-pilot-[a-z0-9-]{1,40}$/.test(project ?? ""));
assert(/^sha256:[a-f0-9]{64}$/.test(nodeImage ?? ""));
assert.equal(
  resolve(privateDirectory ?? ""),
  resolve(".cache", project + "-private"),
);
assert(!lstatSync(privateDirectory).isSymbolicLink());
assert.equal(
  realpathSync(privateDirectory).toLowerCase(),
  resolve(privateDirectory).toLowerCase(),
);
const folder = resolve(".cache", project + "-proxy-proof");
assert.equal(
  dirname(folder).toLowerCase(),
  realpathSync(".cache").toLowerCase(),
);
mkdirSync(folder, { mode: 0o700 });
const nginxImage =
  "nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311";
const names = {
  anchor: project + "-header-sandbox",
  nginx: project + "-header-nginx",
  client: project + "-header-client",
};
const label = "fluivix.proxy-proof=" + project;
const isolation = [
  "--rm",
  "--read-only",
  "--user",
  "1000:1000",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges:true",
];
const started = [];
const phases = [];
function docker(name, args, input) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  writeFileSync(
    resolve(
      folder,
      `${String(phases.length + 1).padStart(2, "0")}-${name}.log`,
    ),
    (result.stdout ?? "") + "\n" + (result.stderr ?? ""),
    { flag: "wx", mode: 0o600 },
  );
  phases.push({ name, exitCode: result.status });
  assert.equal(result.status, 0, "PROXY_HEADER_PHASE_FAILED_" + name);
  return result.stdout;
}
const clientScript = `
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {request} from 'node:https';
import {readFileSync} from 'node:fs';
const ca=readFileSync('/probe-ca.crt');
const server=createServer((req,res)=>{
 if(req.url!=='/api/v1/proxy-proof'){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({forwardedFor:req.headers['x-forwarded-for'],forwardedHost:req.headers['x-forwarded-host'],forwardedProto:req.headers['x-forwarded-proto']}));
});
const call=forwarded=>new Promise((resolve,reject)=>{
 const req=request({hostname:'localhost',family:4,port:18445,path:'/api/v1/proxy-proof',ca,rejectUnauthorized:true,agent:false,timeout:2000,headers:{Host:'localhost:18445','X-Forwarded-For':forwarded,'X-Forwarded-Host':'attacker.invalid','X-Forwarded-Proto':'http'}},res=>{let text='';res.on('data',chunk=>{text+=chunk;if(text.length>4096)req.destroy(Error('LIMIT'));});res.on('end',()=>{try{assert.equal(res.statusCode,200);resolve(JSON.parse(text));}catch(e){reject(e);}});res.on('error',reject);});
 req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TIMEOUT')));req.end();
});
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4300,'127.0.0.1',resolve);});
 let first;
 for(let attempt=0;attempt<30;attempt++){try{first=await call('203.0.113.9');break;}catch{await new Promise(r=>setTimeout(r,200));}}
 assert.deepEqual(first,{forwardedFor:'127.0.0.1',forwardedHost:'localhost',forwardedProto:'https'});
 assert.deepEqual(await call('203.0.113.10, 198.51.100.7'),first);
 console.log('PILOT_FORWARDED_HEADERS_OVERWRITE_PASS');
}catch{console.error('PROXY_HEADER_PROBE_FAILED');process.exitCode=1;}
finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
`;
let result;
try {
  assert.equal(
    docker("refuse-existing-probe", [
      "ps",
      "-a",
      "--filter",
      "label=" + label,
      "--format",
      "{{.Names}} ",
    ]).trim(),
    "",
  );
  const source = readFileSync("infra/pilot/nginx.conf", "utf8");
  assert(source.includes("proxy_set_header X-Forwarded-For $remote_addr;"));
  assert(source.includes("proxy_set_header X-Forwarded-Host $host;"));
  assert(source.includes("proxy_set_header X-Forwarded-Proto https;"));
  // Change only private test ports/upstream addresses. Header policy, TLS and
  // all remaining directives are the actual reviewed deployment configuration.
  assert.equal((source.match(/listen 844[345] ssl/g) ?? []).length, 3);
  assert.equal(
    (
      source.match(
        /proxy_pass http:\/\/(?:web:3000|platform:3001|api:4000);/g,
      ) ?? []
    ).length,
    3,
  );
  const probeConfig = source
    .replace(
      /listen (844[345]) ssl/g,
      (_all, port) => "listen 1" + port + " ssl",
    )
    .replace(
      /proxy_pass http:\/\/(?:web:3000|platform:3001|api:4000);/g,
      "proxy_pass http://127.0.0.1:4300;",
    );
  const filename = resolve(folder, "nginx.conf");
  writeFileSync(filename, probeConfig, { flag: "wx", mode: 0o444 });
  docker("start-isolated-namespace", [
    "run",
    "-d",
    ...isolation,
    "--name",
    names.anchor,
    "--label",
    label,
    "--network",
    "none",
    "--entrypoint",
    "node",
    nodeImage,
    "-e",
    "setInterval(()=>{},60000)",
  ]);
  started.push({ name: names.anchor, image: nodeImage });
  docker("start-real-nginx", [
    "run",
    "-d",
    ...isolation,
    "--name",
    names.nginx,
    "--label",
    label,
    "--network",
    "container:" + names.anchor,
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700",
    "--mount",
    `type=bind,source=${filename},target=/etc/nginx/nginx.conf,readonly`,
    "--mount",
    `type=bind,source=${resolve(privateDirectory, "tls.crt")},target=/run/secrets/tls_certificate,readonly`,
    "--mount",
    `type=bind,source=${resolve(privateDirectory, "tls.key")},target=/run/secrets/tls_key,readonly`,
    "--entrypoint",
    "nginx",
    nginxImage,
    "-g",
    "daemon off;",
  ]);
  started.push({ name: names.nginx, image: nginxImage });
  started.push({ name: names.client, image: nodeImage });
  const observed = docker(
    "real-tls-forwarding-probe",
    [
      "run",
      "-i",
      ...isolation,
      "--name",
      names.client,
      "--label",
      label,
      "--network",
      "container:" + names.anchor,
      "--mount",
      `type=bind,source=${resolve(privateDirectory, "tls.crt")},target=/probe-ca.crt,readonly`,
      "--entrypoint",
      "node",
      nodeImage,
      "--input-type=module",
    ],
    clientScript,
  );
  assert(observed.includes("PILOT_FORWARDED_HEADERS_OVERWRITE_PASS"));
  result = {
    status: "PASS",
    project,
    scope: "ISOLATED_REAL_NGINX_TRANSPORT_CAPTURE",
    nginxImage,
    nodeImage,
    configurationAdaptations: [
      "unpublished test ports",
      "loopback test capture upstreams",
    ],
    originalHeaderAndTlsDirectivesPreserved: true,
    noBusinessApiDebugEndpoint: true,
    noPublicPorts: true,
    forwardedForOverwritten: true,
    forwardedHostOverwritten: true,
    forwardedProtoOverwritten: true,
    injectedForwardedChainIgnored: true,
    tlsCertificateVerified: true,
  };
} catch {
  process.exitCode = 1;
  console.error("PROXY_HEADER_SMOKE_FAILED; inspect private phase logs");
} finally {
  for (const owned of started.reverse()) {
    try {
      const kind =
        owned.name === names.nginx
          ? "nginx"
          : owned.name === names.client
            ? "client"
            : "namespace";
      const found = docker("find-owned-" + kind, [
        "ps",
        "-a",
        "--filter",
        "label=" + label,
        "--filter",
        "name=^/" + owned.name + "$",
        "--format",
        "{{.Names}} ",
      ]).trim();
      if (!found) continue;
      assert.equal(found, owned.name);
      const record = JSON.parse(
        docker("inspect-owned-" + kind, ["inspect", owned.name]),
      )[0];
      assert.equal(record.Config.Labels["fluivix.proxy-proof"], project);
      assert.equal(record.Config.Image, owned.image);
      docker("stop-owned-" + kind, ["stop", owned.name]);
    } catch {
      process.exitCode = 1;
      console.error("PROXY_HEADER_OWNED_CLEANUP_FAILED");
    }
  }
}
if (result && !process.exitCode) {
  writeFileSync(
    ".cache/proxy-header-smoke.json",
    JSON.stringify(
      {
        ...result,
        phases,
        ownedProbesStopped: true,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log("PILOT_FORWARDED_HEADERS_OVERWRITE_PASS");
}
