const core = require('@actions/core');
const github = require('@actions/github');
const CodeOwners = require('./code_owners.js');

//#region CodeOwners
async function getChangedFiles(client, base, head) {
    const response = await client.repos.compareCommits({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        base,
        head
    });

    return response.data.files;
}

async function getCodeOwners(client) {
    const response = await client.repos.getContent({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        path: '.github/CODEOWNERS'
    });

    const content = Buffer.from(response.data.content, 'base64').toString('utf8');
    return new CodeOwners(content);
}

async function makeInitialComment(client, changedFiles) {
    const codeOwners = await getCodeOwners(client);

    const owners = new Set();
    for (const file of changedFiles) {
        const fileOwners = codeOwners.getOwners(file.filename);
        for (const owner of fileOwners) {
            owners.add(owner);
        }
    }

    const comment =
        'Thanks for opening this pull request! \n' +
        (
            owners.size === 0 ?
                'The maintainers will review your changes soon.' :
                'The following people are the code owners of the changed files:\n\n' +
                Array.from(owners).map(owner => `- ${owner}`).join('\n') +
                'Along with the maintainers, they will review your changes soon.'
        );

    return client.issues.createComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.issue.number,
        body: comment
    });
}

//#endregion

//#region Labeler

const ExclusiveLabelMap = new Map([
    [/^test\/addons\//, ['test', 'addons']],
    [/^test\/debugger/, ['test', 'debugger']],
    [/^test\/doctool\//, ['test', 'doc', 'tools']],
    [/^test\/timers/, ['test', 'timers']],
    [/^test\/pseudo-tty\//, ['test', 'tty']],
    [/^test\/inspector/, ['test', 'inspector']],
    [/^test\/cctest\/test_inspector/, ['test', 'inspector']],
    [/^test\/node-api\//, ['test', 'node-api']],
    [/^test\/js-native-api\//, ['test', 'node-api']],
    [/^test\/async-hooks\//, ['test', 'async_hooks']],
    [/^test\/report\//, ['test', 'report']],
    [/^test\/fixtures\/es-module/, ['test', 'esm']],
    [/^test\/es-module\//, ['test', 'esm']],
    [/^test\/fixtures\/wpt\/streams\//, ['test', 'web streams']],
    [/^test\//, ['test']],
    [/^doc\/api\/webcrypto.md$/, ['doc', 'crypto']],
    [/^doc\/api\/modules.md$/, ['doc', 'module']],
    [/^doc\/api\/n-api.md$/, ['doc', 'node-api']],
    [/^doc\/api\/worker_threads.md$/, ['doc', 'worker']],
    [/^doc\/api\/test.md$/, ['doc', 'test_runner']],
    [/^doc\/api\/(\w+)\.md$/, ['doc', '$1']],
    [/^doc\/api\/deprecations.md$/, ['doc', 'deprecations']],
    [/^doc\/changelogs\//, ['release']],
    [/^doc\//, ['doc']],
    [/^benchmark\/buffers\//, ['benchmark', 'buffer']],
    [/^benchmark\/es\//, ['benchmark', 'v8 engine']],
    [/^benchmark\/_http/, ['benchmark', 'http']],
    [/^benchmark\/(?:misc|fixtures)\//, ['benchmark']],
    [/^benchmark\/streams\//, ['benchmark', 'stream']],
    [/^benchmark\/url\//, ['benchmark', 'url', 'whatwg-url']],
    [/^benchmark\/([^\/]+)\//, ['benchmark', '$1']],
    [/^benchmark\//, ['benchmark', 'performance']],

    [/^src\/async_wrap/, ['c++', 'async_wrap']],
    [/^src\/(?:base64|node_buffer|string_)/, ['c++', 'buffer']],
    [/^src\/cares/, ['c++', 'cares']],
    [/^src\/(?:process_wrap|spawn_)/, ['c++', 'child_process']],
    [/^src\/(?:node_)?crypto/, ['c++', 'crypto']],
    [/^src\/debug_/, ['c++', 'debugger']],
    [/^src\/udp_/, ['c++', 'dgram']],
    [/^src\/(?:fs_|node_file|node_stat_watcher)/, ['c++', 'fs']],
    [/^src\/node_http_parser/, ['c++', 'http_parser']],
    [/^src\/node_i18n/, ['c++', 'i18n-api']],
    [/^src\/uv\./, ['c++', 'libuv']],
    [/^src\/(?:connect(?:ion)?|pipe|tcp)_/, ['c++', 'net']],
    [/^src\/node_os/, ['c++', 'os']],
    [/^src\/(?:node_main|signal_)/, ['c++', 'process']],
    [/^src\/timer[_s]/, ['c++', 'timers']],
    [/^src\/node_root_certs/, ['c++', 'tls']],
    [/^src\/tty_/, ['c++', 'tty']],
    [/^src\/node_url/, ['c++', 'whatwg-url']],
    [/^src\/node_util/, ['c++', 'util']],
    [/^src\/node_v8/, ['c++', 'v8 engine']],
    [/^src\/node_contextify/, ['c++', 'vm']],
    [/^src\/node_zlib/, ['c++', 'zlib']],
    [/^src\/tracing/, ['c++', 'tracing']],
    [/^src\/(?:node_api|js_native_api)/, ['c++', 'node-api']],
    [/^src\/node_http2/, ['c++', 'http2']],
    [/^src\/node_report/, ['c++', 'report']],
    [/^src\/node_wasi/, ['c++', 'wasi']],
    [/^src\/node_worker/, ['c++', 'worker']],
    [/^src\/quic\/*/, ['c++', 'quic']],
    [/^src\/node_bob*/, ['c++', 'quic']],
    [/^src\/node_sea/, ['single-executable']],
    [/^src\/inspector_/, ['c++', 'inspector', 'needs-ci']],
    [/^src\/(?!node_version\.h)/, ['c++']],
    [/^BUILDING\.md$/, ['build', 'doc']],
    [/^(?:[A-Z]+$|CODE_OF_CONDUCT|GOVERNANCE|CHANGELOG|\.mail|\.git.+)/, ['meta']],
    [/^\w+\.md$/, ['doc']],
    [/^(?:tools\/)?(?:Makefile|BSDmakefile|create_android_makefiles)$/, ['build', 'needs-ci']],
    [/^tools\/(?:install\.py|getnodeversion\.py|js2c\.py|utils\.py|configure\.d\/.*)$/, ['build', 'python', 'needs-ci']],
    [/^vcbuild\.bat$/, ['build', 'windows', 'needs-ci']],
    [/^(?:android-)?configure|node\.gyp|common\.gypi$/, ['build', 'needs-ci']],
    [/^tools\/gyp/, ['tools', 'build', 'gyp', 'needs-ci']],
    [/^tools\/doc\//, ['tools', 'doc']],
    [/^tools\/icu\//, ['tools', 'i18n-api', 'icu', 'needs-ci']],
    [/^tools\/osx-/, ['tools', 'macos']],
    [/^tools\/test-npm/, ['tools', 'test', 'npm']],
    [/^tools\/test/, ['tools', 'test']],
    [/^tools\/(?:certdata|mkssldef|mk-ca-bundle)/, ['tools', 'openssl', 'tls']],
    [/^tools\/msvs\//, ['tools', 'windows', 'install', 'needs-ci']],
    [/^tools\/[^\/]+\.bat$/, ['tools', 'windows', 'needs-ci']],
    [/^tools\/make-v8/, ['tools', 'v8 engine', 'needs-ci']],
    [/^tools\/v8_gypfiles/, ['tools', 'v8 engine', 'needs-ci']],
    [/^tools\/snapshot/, ['needs-ci']],
    [/^tools\/build-addons.mjs/, ['needs-ci']],
    [/^tools\//, ['tools']],
    [/^\.eslint|\.editorconfig/, ['tools']],
    [/^typings\//, ['typings']],
    [/^deps\/uv\//, ['libuv']],
    [/^deps\/v8\/tools\/gen-postmortem-metadata\.py/, ['v8 engine', 'python', 'post-mortem']],
    [/^deps\/v8\//, ['v8 engine']],
    [/^deps\/uvwasi\//, ['wasi']],
    [/^deps\/npm\//, ['npm', 'fast-track']],
    [/^deps\/nghttp2\/nghttp2\.gyp/, ['build', 'http2']],
    [/^deps\/nghttp2\//, ['http2']],
    [/^deps\/ngtcp2\//, ['quic']],
    [/^deps\/([^\/]+)/, ['dependencies', '$1']],
    [/^lib\/(?:punycode|\w+\/freelist|sys\.js)/, ['deprecation']],
    [/^lib\/constants\.js$/, ['lib / src']],
    [/^lib\/internal\/debugger$/, ['debugger']],
    [/^lib\/internal\/linkedlist\.js$/, ['timers']],
    [/^lib\/internal\/bootstrap/, ['lib / src']],
    [/^lib\/internal\/v8_prof_/, ['tools']],
    [/^lib\/internal\/socket(?:_list|address)\.js$/, ['net']],
    [/^lib\/\w+\/streams$/, ['stream']],
    [/^lib\/.*http2/, ['http2']],
    [/^lib\/worker_threads.js$/, ['worker']],
    [/^lib\/test.js$/, ['test_runner']],
    [/^lib\/internal\/url\.js$/, ['whatwg-url']],
    [/^lib\/internal\/modules\/esm/, ['esm']],
    [/^lib\/internal\/webstreams/, ['web streams']],
    [/^lib\/internal\/test_runner/, ['test_runner']],
    [/^lib\/_(\w+)_\w+\.js?$/, ['$1']],
    [/^lib(?:\/internal)?\/(\w+)\.js?$/, ['$1']],
    [/^lib(?:\/internal)?\/(\w+)(?:\/|$)/, ['$1']],
]);

const InclusiveLabelMap = new Map([
    [/^(deps|lib|src|test)\//, ['needs-ci']],
    [/^(lib|src)\//, ['lib / src']],
]);

const Subsystems = [
    'assert',
    'async_hooks',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'crypto',
    'debugger',
    'dgram',
    'diagnostics_channel',
    'dns',
    'domain',
    'events',
    'esm',
    'fs',
    'http',
    'https',
    'http2',
    'inspector',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'quic',
    'readline',
    'repl',
    'report',
    'stream',
    'string_decoder',
    'timers',
    'tls',
    'trace_events',
    'tty',
    'typings',
    'url',
    'util',
    'v8',
    'vm',
    'wasi',
    'worker',
    'zlib',
]

function applyLabels(client, changedFiles) {
    const labels = new Set();
    for (const file of changedFiles) {
        // Only apply the first match
        for (const [regex, fileLabels] of ExclusiveLabelMap) {
            const match = regex.exec(file.filename);
            if (match) {
                labels.add(...fileLabels.map(l => l.replace(/\$(\d+)/g, (_, i) => match[i])));
                break;
            }
        }
        // Apply all matches
        for (const [regex, fileLabels] of InclusiveLabelMap) {
            if (regex.test(file.filename)) {
                labels.add(...fileLabels);
            }
        }
    }

    const prMessage = github.context.payload.pull_request?.body;
    const subsystems = prMessage.split(':')[0].split(',').map(s => s.trim());
    for (const subsystem of subsystems) {
        if (Subsystems.includes(subsystem)) {
            labels.add(subsystem);
        }
    }

    const prBaseBranch = github.context.payload.pull_request?.base?.ref;
    const matchBranch = /^(v\d+\.(?:\d+|x))(?:-staging|$)/.exec(prBaseBranch);
    if (matchBranch) {
        labels.add(matchBranch[1]);
    }
    
    let labelsArray = Array.from(labels);
    if (labelsArray.length === 0) {
        return;
    }

    const MAX_LABELS = 5;
    if (labelsArray.length > MAX_LABELS) {
        labelsArray = labelsArray.slice(0, MAX_LABELS);
    }

    return client.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.issue.number,
        labels: labelsArray
    });
}

//#endregion

// Main function
async function run() {
    const client = new github.getOctokit(core.getInput('token', { required: true }));

    const base = github.context.payload.pull_request?.base?.sha;
    const head = github.context.payload.pull_request?.head?.sha;

    if (!base || !head) {
        core.setFailed('Cannot get base or head commit');
        return;
    }

    const changedFiles = await getChangedFiles(client, base, head);


    await makeInitialComment(client, changedFiles);
    await applyLabels(client, changedFiles);
}

run();
