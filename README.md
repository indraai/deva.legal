# Legal Deva

Legal Deva is the legal agent for Indra.ai and Deva.world, based on Vedic Tradition. Its agent key is `legal`. It stores laws in a MongoDB `laws` collection, searches them with a text index, and keeps a chain-of-custody log of `devacore:finish` and `devacore:complete` packets in a MongoDB log database. Commands talk to it directly with `/add` or `/search` or, from another Deva, with `#legal add`.

## Requirements

- Node.js with npm. Legal Deva's `package.json` sets no `engines`. Deva Core 1.67.26 declares `"node": ">=22"` and `"npm": ">=9.5.1"` in its own `package.json`.
- A project with `"type": "module"` in its `package.json`. Legal Deva is an ES module.
- `@indra.ai/deva` `^1.67.26` (Deva Core) and `mongodb` `^7.9.1`. Both install with Legal Deva.
- A MongoDB server if you want laws and logs saved. A local `mongod` at `mongodb://127.0.0.1:27017` is enough.

## Install

```bash
npm install @indra.ai/deva.legal --save
```

```js
import LegalDeva from '@indra.ai/deva.legal';
```

## Two licenses

A running Deva carries two separate licenses, and each is checked on its own.

- **The core license** comes through the client data as `client.VLA`. Deva Core checks it against the core package's VLA at the start of `init`.
- **The agent license** comes through the license feature data as `features.license.devas.legal`. Deva Core 1.67.26 checks it against the VLA in Legal Deva's own `package.json` right after the features load and before `onInit`. Legal Deva has no `onInit` of its own, so it has no license check of its own to change or remove.

The agent check compares the sha256 of the whole VLA object, so every field has to match exactly.

## Configuration

Legal Deva reads two features from the client you pass to `init()`. The feature data loader puts them in the client, and Deva Core loads them into the Deva at startup, so both must be there before `init()` runs.

```json
"features": {
	"license": {
		"concerns": [],
		"global": [],
		"devas": {
			"legal": {"uid": "38081583681664078895"}
		}
	},
	"legal": {
		"concerns": [],
		"global": {
			"mongo": {
				"uri": "mongodb://127.0.0.1:27017",
				"database": "LegalDeva",
				"log": "LegalDevaLog"
			}
		},
		"devas": {
			"legal": {
				"mongo": {
					"uri": "mongodb://127.0.0.1:27017",
					"database": "LegalDeva",
					"log": "LegalDevaLog"
				}
			}
		}
	}
}
```

- `license.devas.legal` is the agent VLA. The short form above only shows where it goes. It must be the full `VLA` object from this package's `package.json`, for example:

```js
import pkg from '@indra.ai/deva.legal/package.json' with {type:'json'};

const devas = {legal: pkg.VLA}; // goes in features.license.devas
```

- `legal.global.mongo.uri` is the MongoDB connection string. If it is not set, Legal Deva still comes online but builds no MongoDB client. `this.modules.client` stays `false`. Calls to `func.write_log`, `func.insert`, `func.update`, `func.search`, and `methods.add` (with text) then reject.
- `legal.global.mongo.database` is the main database name. `onReady` stores it in `this.vars.database`. Laws are stored in the `laws` collection in that database.
- `legal.global.mongo.log` is the log database name. `onReady` stores it in `this.vars.log`. `func.write_log` inserts into a named collection in that database.
- `this.vars.database` and `this.vars.log` both start as `false` in `package.json`. `onReady` reads `this.legal().global?.mongo` and assigns each field only when it is set: `this.vars.database = database ? database : this.vars.database`, and the same for `log`. If `database` or `log` is omitted, `onReady` keeps the existing value.
- The tests also set `legal.devas.legal` with the same `{uri, database, log}` shape. That is the personal record for this agent (`agent.key` is `legal`). Deva Core exposes it as `this.legal().personal`. `onReady` and the MongoDB functions read only `this.legal().global?.mongo`. They do not use the personal record.

## Load it

```js
import LegalDeva from '@indra.ai/deva.legal';

const legal = await LegalDeva.init(client); // client data provided by your loader
console.log(legal.id.uid);
```

When the license checks pass, Legal Deva walks start, enter, done and ready. In `onReady` it reads `this.legal().global?.mongo`, builds a `MongoClient` in `this.modules.client` when `uri` is set, keeps `database` in `this.vars.database` and `log` in `this.vars.log` when those values are set, and prompts `🏛️ Legal Deva Ready > VLA:38081583681664078895`.

To shut it down:

```js
await LegalDeva.stop();
```

`onStop` closes the MongoDB client, if there is one, then calls `this.close(data, resolve)`. If there is no client, it calls `this.close(data, resolve)` directly. A stopped Deva can start again. Call `init()` again with a client that passes the license check. Legal Deva builds a new MongoDB client in `onReady`.

## When Legal Deva refuses to start

If the agent license check fails, Deva Core prompts the message, stops the Deva, and `init()` resolves with that message.

| You see | Why |
| --- | --- |
| `❌ Bad Personal VLA` | `features.license.devas` is there but has no `legal` entry. |
| `❌ Invalid VLA Check` | The `legal` entry doesn't match this package's VLA, or the license feature has no `devas`. |

## Commands

Talk to Legal Deva with `/add` or `/search` when it is the current agent, or with `#legal add` from another Deva.

| Command | What it does |
| --- | --- |
| `/add` | If there is no text, returns `_messages.notext`. Otherwise inserts `packet.q.text` as `content` into the `laws` collection of `this.vars.database`. When `packet.q.meta.params[1]` is a law id, it updates that law and sets `modified`. It returns `{text, html, data}`, where `text` and `html` are `id: <id>` and `data` is the id string. If there is no MongoDB client, or the write fails, `methods.add` catches the error and returns `this.err(err, packet, reject)`, which goes through `onError`. The add rejects. It does not hang, and it does not resolve with empty data. |
| `/search` | If there is no text, returns `_messages.notext`. Otherwise runs `func.search` on the text. When `packet.q.meta.params[1]` is set, that value becomes `this.vars.laws.limit`. It then asks Feecting to parse the formatted results (`#feecting parse`) and returns `{text, html, data}`, where `data` holds the search hits and the Feecting parse. The success path needs Feecting. If the search or the Feecting parse fails, `methods.search` returns `this.err(err, packet, reject)`. |

`methods.add(packet)` and `methods.search(packet)` are the methods behind those commands. They live in `index.js`.

## Functions

| Func | What it does |
| --- | --- |
| `write_log` | Inserts `packet` into collection `type` in `this.vars.log`, using the one `MongoClient` in `this.modules.client`. It returns the `insertOne` result. The `devacore:finish` and `devacore:complete` listeners call it with `'finish'` and `'complete'`. There is no try/catch in `func.write_log`; a missing client or a failed insert throws. The listeners do not await the write. |
| `insert` | Inserts `opts.data` into `opts.collection` in `this.vars.database`. It returns the `insertOne` result. `methods.add` calls it for a new law, with the `laws` collection. There is no try/catch in `func.insert`; a missing client or a failed insert throws, and `methods.add` handles it. |
| `update` | Updates the document whose `_id` is `opts.id` in `opts.collection` with `$set: opts.data`. It returns the `updateOne` result. `methods.add` calls it when `params[1]` is a law id. There is no try/catch in `func.update`; a missing client or a failed update throws, and `methods.add` handles it. |
| `search` | Creates the `laws_search` text index on `content` in the `laws` collection if it is not already there, then runs a `$text` search for `opts.text`. It returns an array of `{content, score}` hits, limited by `this.vars.laws.limit` (the default in `package.json` is 5). There is no try/catch in `func.search`; a missing client or a failed search throws, and `methods.search` handles it. |

## Feature methods

`feature/methods.js` exports a `legal(packet)` method. The feature loader binds it at runtime from `client.features.legal.methods` onto the Deva's `methods`. The method calls `this.methods.sign('legal', 'default', packet)` and returns that result. `add` and `search` stay on `methods` from `index.js`.

## Help

Help lives in Feecting files. `help/main.feecting` is the main help page, with the heading `{{profile.name}}`, and it also holds the license block. `help/header.feecting` is the help header, including the amendments block. `help/corpus.feecting` is the help corpus. `help/programs/SystemCorruptionLaw.feecting` is the System Corruption Law program. `help/training/` holds the training pages (`start`, `collaborate`, `compliance`, `conclusion`, `guidelines`, `knowledge`, `learning`, `principles`, and `studies`). The tests check that the main heading is there and that the license page carries this package's VLA uid and hash tiers.

## Inside Legal Deva

| Name | Kind | What it does |
| --- | --- | --- |
| `write_log` | func | Inserts a packet into a named collection in the log database, as described above. It lives in `index.js`. |
| `insert`, `update`, `search` | func | Write and search laws in `this.vars.database`, as described above. They live in `index.js`. |
| `add`, `search` | method | The `/add` and `/search` commands, also in `index.js`. |
| `legal` | feature method | The `legal(packet)` method in `feature/methods.js`, bound at runtime. |
| `devacore:finish`, `devacore:complete` | listeners | Call `func.write_log` with `'finish'` and `'complete'`. They do not check `this._active`, and they do not await the write. |
| `translate`, `parse`, `process` | utils | Each returns its input trimmed. |
| `onReady` | lifecycle | Reads mongo from `this.legal().global?.mongo`, builds the MongoDB client when `uri` is set, keeps existing `database` and `log` values when those fields are omitted, and prompts the ready message. |
| `onStop` | lifecycle | Closes the MongoDB client, if there is one, then calls `this.close(data, resolve)`. |
| `onError` | lifecycle | Prompts `💣 ERROR!`, logs the error, and returns `reject(err)` or `Promise.reject(err)`. |
| `modules.client` | module | The `MongoClient`, set in `onReady` when a `uri` is given. It starts as `false`. |

The `vars` in `package.json` hold the prompt `messages`, the `@LEGAL` trigger, the add and search context labels, and the `laws` settings (`collection` is `laws`, `index` is `laws_search`, `limit` is 5, and `content` starts as `false`). `this.vars.database` and `this.vars.log` start as `false` and are set in `onReady` from `global.mongo.database` and `global.mongo.log` when those values are present.

## Testing

Start a local MongoDB, then run:

```bash
npm test
```

The package.json `test` script is `node --test`, so `npm test` and `node --test` run the same file. The tests use `mongodb://127.0.0.1:27017` by default. To use another server, set `MONGO_URI`:

```bash
MONGO_URI="mongodb://127.0.0.1:27018" npm test
```

The tests always write to their own databases, `deva_legal_test` and `deva_legal_log_test`, and drop them when they finish. Only the server can change, so the cleanup never touches another database. If MongoDB can't be reached, the MongoDB tests are skipped with a message and the rest still run, including the check that `write_log`, `insert`, and `add` reject when no MongoDB client is built.

The tests build a stub client in code from the core VLA in `@indra.ai/deva/package.json` and the VLA in this package's `package.json`, so no client file is needed. They cover:

- legal builds as a Deva and waits offline before init
- legal data has no placeholders left
- `func` (`write_log`, `insert`, `update`, `search`), `methods` (`add`, `search`), `listeners` (`devacore:finish`, `devacore:complete`), `onReady`, `onStop`, and `onError` exist
- `init` with no mongo config keeps `vars.database` and `vars.log` false and builds no client
- legal comes online and walks to ready
- legal agent matches the package
- legal utils answer with trimmed text
- legal help pages name the Deva and carry the package license
- feature methods from `feature/methods.js` load at runtime
- `insert`, `update`, and `search` write to the `laws` collection, and `search` creates the `laws_search` text index (MongoDB)
- `methods.add` inserts and updates a law (MongoDB)
- `methods.search` with no text returns notext
- `write_log` writes finish and complete packets to the log database (MongoDB)
- the `devacore:finish` and `devacore:complete` listeners write to the log database (MongoDB)
- a stop and `init` restart builds a new MongoClient and can insert and log again (MongoDB)
- `write_log`, `insert`, and `add` reject when no MongoDB client is built
- legal stops through the full chain
- legal refuses to start with a bad agent VLA

## Files

| File | What it holds |
| --- | --- |
| `index.js` | The Legal Deva: utils, `func.write_log`, `func.insert`, `func.update`, `func.search`, `methods.add`, `methods.search`, the finish and complete listeners, and the lifecycle hooks. |
| `package.json` | Package info, the package VLA, and the agent and vars data under `data`. |
| `feature/methods.js` | The `legal(packet)` feature method that the feature loader binds at runtime. |
| `help/main.feecting` | The main help page and the license block. |
| `help/header.feecting` | The help header, including the amendments block. |
| `help/corpus.feecting` | The help corpus. |
| `help/programs/SystemCorruptionLaw.feecting` | The System Corruption Law program. |
| `help/training/` | The training pages. |
| `data/manu/` | The Laws of Manu JSON files and the `manu`, `manuhash`, and `laws` helpers. |
| `index.test.js` | The tests. |
| `assets/` | The emoji, avatar, background and main images. |
| `LICENSE.md` | The license. |

Copyright ©2000-2026 Quinn Michaels; All rights reserved.  
Legal Signature Required For Lawful Use.  
Distributed under VLA:38081583681664078895 LICENSE.md  
Tuesday, November 24, 2026 - 11:49:58 AM PST
