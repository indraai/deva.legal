"use strict";
// Legal Test File
// Copyright ©2000-2026 Quinn Michaels; All rights reserved. 
// Owner Signature Required For Lawful Use.
// Distributed under VLA:38081583681664078895 LICENSE.md
// Tuesday, November 24, 2026 - 11:49:58 AM PST

// run with: npm test
// MongoDB tests use a local server at mongodb://127.0.0.1:27017 by default. Set MONGO_URI to use another one.
// They skip with a message when MongoDB can't be reached.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MongoClient, ObjectId} from 'mongodb';
import Deva from '@indra.ai/deva';
import core from '@indra.ai/deva/package.json' with {type:'json'};
import pkg from './package.json' with {type:'json'};
import featureMethods from './feature/methods.js';
import LEGAL from './index.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const STAGES = ['start', 'enter', 'done', 'ready'];
const TIERS = ['md5', 'sha256', 'sha512'];
const PLACEHOLDER = /::[a-z-]+::|\{\{profile\.[a-z]+\}\}/;
const FEATURE_KEYS = ['legal'];

// test databases: the uri can change, the names are fixed so the after hook only ever drops the test databases.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const LEGAL_DB = 'deva_legal_test';
const LEGAL_LOG = 'deva_legal_log_test';

// check the server once before the tests are defined so the MongoDB tests can skip cleanly.
const mongo = new MongoClient(MONGO_URI, {serverSelectionTimeoutMS: 2000});
const MONGO_SKIP = await mongo.db('admin').command({ping: 1}).then(
	() => false,
	err => `MongoDB is not reachable at ${MONGO_URI} (${err.message}). Start a local mongod or set MONGO_URI.`
);
if (MONGO_SKIP) console.log(`⏭️ ${MONGO_SKIP}`);

// stub client built in code: the core VLA for the core check, the agent VLA for Legal Deva
// and the mongo settings for the legal feature. useMongo false leaves the legal feature without a database.
const client = (agentVLA = pkg.VLA, useMongo = true, uri = MONGO_URI, methods = false) => ({
	id: '00000000000000000000',
	key: 'client',
	VLA: structuredClone(core.VLA),
	prompt: {
		emoji: '🧪',
		text: 'client',
		colors: {
			label: {R: 2, G: 229, B: 77},
			text: {R: 2, G: 229, B: 77},
		},
	},
	profile: {
		id: '00000000000000000000',
		name: 'Test Client',
		describe: 'Test client for Legal Deva',
		lang: 'en',
		locale: 'en-US',
		currency: 'USD',
	},
	features: {
		license: {
			concerns: [],
			global: [],
			devas: {
				legal: structuredClone(agentVLA),
			},
		},
		legal: {
			concerns: [],
			global: useMongo ? {mongo: {uri, database: LEGAL_DB, log: LEGAL_LOG}} : {},
			devas: useMongo ? {legal: {mongo: {uri, database: LEGAL_DB, log: LEGAL_LOG}}} : {},
			methods: methods || undefined,
		},
	},
});

// poll for a document written by a fire-and-forget listener.
async function findDoc(database, collection, query, tries = 30) {
	for (let i = 0; i < tries; i++) {
		const doc = await mongo.db(database).collection(collection).findOne(query);
		if (doc) return doc;
		await new Promise(r => setTimeout(r, 100));
	}
	return null;
}

let legalClient = false; // Legal Deva's own MongoClient, kept so the after hook can close it.

after(async () => {
	if (!MONGO_SKIP) {
		await mongo.db(LEGAL_DB).dropDatabase();
		await mongo.db(LEGAL_LOG).dropDatabase();
	}
	await mongo.close();
	if (legalClient) await legalClient.close();
});

test('legal builds as a Deva and waits offline before init', async () => {
	assert.ok(LEGAL instanceof Deva, 'the export is a Deva');
	assert.equal(LEGAL.vars.database, false, 'default vars.database is false');
	assert.equal(LEGAL.vars.log, false, 'default vars.log is false');
	assert.equal(await LEGAL.stop(), LEGAL._messages.offline, 'stop before init answers offline');
});

test('legal data has no placeholders left', () => {
	assert.doesNotMatch(JSON.stringify(pkg.data), PLACEHOLDER, 'package.json data');
	assert.doesNotMatch(JSON.stringify(pkg.VLA), PLACEHOLDER, 'package.json VLA');
	assert.doesNotMatch(pkg.copyright, PLACEHOLDER, 'package.json copyright');
});

test('func, methods, listeners, onReady, onStop, and onError exist', () => {
	assert.equal(typeof LEGAL.func.write_log, 'function', 'func.write_log');
	assert.equal(typeof LEGAL.func.insert, 'function', 'func.insert');
	assert.equal(typeof LEGAL.func.update, 'function', 'func.update');
	assert.equal(typeof LEGAL.func.search, 'function', 'func.search');
	assert.equal(typeof LEGAL.methods.add, 'function', 'methods.add');
	assert.equal(typeof LEGAL.methods.search, 'function', 'methods.search');
	assert.equal(typeof LEGAL.listeners['devacore:finish'], 'function', 'listeners.devacore:finish');
	assert.equal(typeof LEGAL.listeners['devacore:complete'], 'function', 'listeners.devacore:complete');
	assert.equal(typeof LEGAL.onReady, 'function', 'onReady');
	assert.equal(typeof LEGAL.onStop, 'function', 'onStop');
	assert.equal(typeof LEGAL.onError, 'function', 'onError');
});

// a fresh instance with no legal.global.mongo keeps the starting false values and builds no client.
test('init with no mongo config keeps vars false and builds no client', async () => {
	const {default: NOMONGO} = await import('./index.js?nomongo');
	assert.equal(NOMONGO.vars.database, false, 'database starts false');
	assert.equal(NOMONGO.vars.log, false, 'log starts false');
	const data = await NOMONGO.init(client(pkg.VLA, false));
	assert.equal(typeof data.ready, 'number', 'nomongo instance reaches ready');
	assert.equal(NOMONGO.vars.database, false, 'database stays false');
	assert.equal(NOMONGO.vars.log, false, 'log stays false');
	assert.equal(NOMONGO.modules.client, false, 'no MongoClient is built');
	await NOMONGO.stop();
});

test('legal comes online and walks to ready', async () => {
	const prompts = [];
	LEGAL.listen('devacore:prompt', packet => prompts.push(packet.text));
	const data = await LEGAL.init(client());
	for (const k of STAGES) assert.equal(typeof data[k], 'number', `${k} timestamp`);
	assert.ok(data.start <= data.enter && data.enter <= data.done && data.done <= data.ready, 'stages in order');
	assert.equal(typeof data.id.uid, 'string', 'uid');
	for (const t of TIERS) assert.equal(typeof data[t], 'string', `${t} hash`);
	assert.ok(prompts.includes(`${LEGAL.vars.messages.ready} > VLA:${pkg.VLA.uid}`), 'onReady prompts the ready message');
	assert.ok(LEGAL.modules.client instanceof MongoClient, 'onReady builds the MongoClient');
	assert.equal(LEGAL.vars.database, LEGAL_DB, 'onReady sets the legal database');
	assert.equal(LEGAL.vars.log, LEGAL_LOG, 'onReady sets the legal log database');
	legalClient = LEGAL.modules.client;
});

test('legal agent matches the package', () => {
	const agent = LEGAL.agent();
	assert.equal(agent.key, 'legal');
	assert.equal(agent.id, pkg.id);
	assert.equal(agent.profile.id, pkg.id);
	assert.equal(agent.profile.name, 'Legal Deva');
	assert.equal(agent.profile.owner, 'Quinn Michaels');
});

test('legal utils answer with trimmed text', () => {
	const {translate, parse, process} = LEGAL.utils;
	for (const util of [translate, parse, process]) assert.equal(util('  hello  '), 'hello');
});

test('legal help pages name the Deva and carry the package license', async () => {
	const main = await LEGAL.help('main', DIR);
	assert.match(main, /^# \{\{profile\.name\}\}$/m, 'main help heading');
	const license = await LEGAL.help('main:license', DIR);
	assert.match(license, new RegExp(`^uid: ${pkg.VLA.uid}$`, 'm'), 'license uid');
	for (const t of TIERS) assert.ok(license.includes(`${t}: ${pkg.VLA[t]}`), `${t} hash in the license help`);
});

// the feature loader binds client.features.legal.methods onto the Deva at init.
// this uses a fresh instance so it does not change the methods on LEGAL.
test('feature methods from feature/methods.js load at runtime', async () => {
	assert.deepEqual(Object.keys(featureMethods), FEATURE_KEYS, 'feature export names');
	assert.equal(typeof featureMethods.legal, 'function', 'feature.legal');
	const {default: FEATURE} = await import('./index.js?feature');
	const data = await FEATURE.init(client(pkg.VLA, false, MONGO_URI, featureMethods));
	assert.equal(typeof data.ready, 'number', 'feature instance reaches ready');
	assert.equal(typeof FEATURE.methods.legal, 'function', 'the feature loader binds legal');
	assert.equal(typeof FEATURE.methods.add, 'function', 'add stays on methods');
	assert.equal(typeof FEATURE.methods.search, 'function', 'search stays on methods');
	await FEATURE.stop();
});

test('insert, update, and search write to the laws collection', {skip: MONGO_SKIP}, async () => {
	const ins = await LEGAL.func.insert({
		collection: 'laws',
		data: {content: 'the king shall protect the realm', created: Date.now()},
	});
	assert.equal(ins.acknowledged, true, 'insert acknowledged');
	assert.ok(ins.insertedId, 'insert returns an id');

	const upd = await LEGAL.func.update({
		id: String(ins.insertedId),
		collection: 'laws',
		data: {content: 'the king shall justly protect the realm', modified: Date.now()},
	});
	assert.equal(upd.acknowledged, true, 'update acknowledged');
	assert.equal(upd.matchedCount, 1, 'update matched the inserted law');

	const hits = await LEGAL.func.search({text: 'justly protect'});
	assert.ok(Array.isArray(hits), 'search returns an array');
	assert.ok(hits.some(h => /justly protect the realm/.test(h.content)), 'search hits the updated content');

	const idx = await mongo.db(LEGAL_DB).collection('laws').listIndexes().toArray();
	assert.ok(idx.some(i => i.name === 'laws_search'), 'search creates the laws_search text index');
});

test('methods.add inserts and updates a law', {skip: MONGO_SKIP}, async () => {
	const empty = await LEGAL.methods.add({q: {text: '', meta: {params: []}}});
	assert.equal(empty, LEGAL._messages.notext, 'empty text returns notext');

	const added = await LEGAL.methods.add({q: {text: 'a contract made contrary to law has no force', meta: {params: []}}});
	assert.match(added.text, /^id: /, 'add text carries the id');
	assert.equal(added.html, added.text, 'add html matches text');
	assert.equal(typeof added.data, 'string', 'add data is the inserted id');
	const insertedId = added.data;
	const fresh = await mongo.db(LEGAL_DB).collection('laws').findOne({_id: new ObjectId(insertedId)});
	assert.equal(fresh?.content, 'a contract made contrary to law has no force');
	assert.equal(fresh?.modified, null);
	assert.equal(typeof fresh?.created, 'number');

	const updated = await LEGAL.methods.add({
		q: {
			text: 'a contract made contrary to the established rule of law has no force',
			meta: {params: ['add', insertedId]},
		},
	});
	assert.equal(updated.data, insertedId, 'update returns the same id');
	const after = await mongo.db(LEGAL_DB).collection('laws').findOne({_id: fresh._id});
	assert.equal(after?.content, 'a contract made contrary to the established rule of law has no force');
	assert.equal(typeof after?.modified, 'number', 'update sets modified');
});

// methods.search with no text returns notext here. with text it also asks Feecting to parse the result,
// so the database search path is covered by func.search instead of calling Feecting from this file.
test('methods.search with no text returns notext', () => {
	return LEGAL.methods.search({q: {text: '', meta: {params: []}}}).then(ans => {
		assert.equal(ans, LEGAL._messages.notext, 'empty text returns notext');
	});
});

test('write_log writes finish and complete packets to the log database', {skip: MONGO_SKIP}, async () => {
	const finish = {id: {uid: 'write-log-finish-1'}, content: 'finish log', created: Date.now()};
	const complete = {id: {uid: 'write-log-complete-1'}, content: 'complete log', created: Date.now()};
	const fin = await LEGAL.func.write_log('finish', finish);
	const com = await LEGAL.func.write_log('complete', complete);
	assert.equal(fin.acknowledged, true);
	assert.equal(com.acknowledged, true);
	const finDoc = await mongo.db(LEGAL_LOG).collection('finish').findOne({'id.uid': 'write-log-finish-1'});
	const comDoc = await mongo.db(LEGAL_LOG).collection('complete').findOne({'id.uid': 'write-log-complete-1'});
	assert.equal(finDoc?.content, 'finish log');
	assert.equal(comDoc?.content, 'complete log');
});

// the finish and complete listeners call write_log without awaiting it, so the test polls for the documents.
test('devacore finish and complete listeners write to the log database', {skip: MONGO_SKIP}, async () => {
	LEGAL.talk('devacore:finish', {id: {uid: 'listener-finish-1'}, content: 'listener finish'});
	LEGAL.talk('devacore:complete', {id: {uid: 'listener-complete-1'}, content: 'listener complete'});
	const fin = await findDoc(LEGAL_LOG, 'finish', {'id.uid': 'listener-finish-1'});
	const com = await findDoc(LEGAL_LOG, 'complete', {'id.uid': 'listener-complete-1'});
	assert.equal(fin?.content, 'listener finish');
	assert.equal(com?.content, 'listener complete');
});

test('a stop and init restart builds a new MongoClient and can insert and log again', {skip: MONGO_SKIP}, async () => {
	const before = LEGAL.modules.client;
	await LEGAL.stop();
	const data = await LEGAL.init(client());
	assert.equal(typeof data.ready, 'number', 'restart reaches ready');
	assert.ok(LEGAL.modules.client instanceof MongoClient, 'restart builds a MongoClient');
	assert.notEqual(LEGAL.modules.client, before, 'the MongoClient is new');
	legalClient = LEGAL.modules.client;
	const ins = await LEGAL.func.insert({
		collection: 'laws',
		data: {content: 'after restart the law still holds', created: Date.now()},
	});
	assert.equal(ins.acknowledged, true);
	const doc = await mongo.db(LEGAL_DB).collection('laws').findOne({_id: ins.insertedId});
	assert.equal(doc?.content, 'after restart the law still holds');
	const logged = await LEGAL.func.write_log('finish', {id: {uid: 'write-log-restart-1'}, content: 'after restart'});
	assert.equal(logged.acknowledged, true);
	const logDoc = await mongo.db(LEGAL_LOG).collection('finish').findOne({'id.uid': 'write-log-restart-1'});
	assert.equal(logDoc?.content, 'after restart');
});

// runs in a child process with a fresh Legal Deva and no database, so it does not
// share the bound func object or MongoClient with the tests that use LEGAL.
test('write_log, insert, and add reject when no MongoDB client is built', async () => {
	const code = [
		`const {default: LEGAL} = await import(${JSON.stringify(new URL('./index.js', import.meta.url).href)});`,
		'await LEGAL.init(JSON.parse(process.env.LEGAL_TEST_CLIENT));',
		"const payload = {content: 'no mongo'};",
		"const packet = {q: {text: 'no mongo', meta: {params: []}}};",
		'for (const [label, run] of [',
		"	['func.write_log', () => LEGAL.func.write_log('finish', {id: {uid: 'write-log-missing-1'}, content: 'no mongo'})],",
		"	['func.insert', () => LEGAL.func.insert({collection: 'laws', data: payload})],",
		"	['methods.add', () => LEGAL.methods.add(packet)],",
		']) {',
		'	try {',
		'		let timer;',
		'		await Promise.race([',
		'			run(),',
		'			new Promise((_, reject) => {timer = setTimeout(() => reject(new Error("TIMEOUT")), 8000);}),',
		'		]).finally(() => clearTimeout(timer));',
		'		console.log(`RESOLVED:${label}`);',
		'		process.exit(2);',
		'	} catch (err) {',
		'		if (/TIMEOUT/.test(err.message)) {',
		'			console.log(`BAD:${label}:${err.message}`);',
		'			process.exit(3);',
		'		}',
		'		console.log(`REJECTED:${label}`);',
		'	}',
		'}',
		'await LEGAL.stop();',
		'console.log("RESULT:ok");',
	].join('\n');
	const env = {PATH: process.env.PATH, LEGAL_TEST_CLIENT: JSON.stringify(client(pkg.VLA, false))};
	const run = promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], {cwd: DIR, env, timeout: 20000, killSignal: 'SIGKILL'});
	const {stdout} = await run.catch(err => {
		if (err.stdout) assert.fail(err.stdout.trim());
		const why = err.killed ? 'did not return within 20 seconds' : `failed: ${err.message}`;
		assert.fail(`calls without a MongoDB client ${why}`);
	});
	assert.match(stdout, /^RESULT:ok$/m, 'every call rejected without hanging');
});

test('legal stops through the full chain', async () => {
	const data = await LEGAL.stop();
	assert.equal(data.key, 'shutdown', 'the chain ends on shutdown');
	assert.equal(data.value, 'legal');
	legalClient = false;
});

// the refusal check loads a fresh Legal Deva instance from the same file, so it starts from a clean state.
test('legal refuses to start with a bad agent VLA', async () => {
	const {default: REFUSE} = await import('./index.js?refuse');
	const prompts = [];
	REFUSE.listen('devacore:prompt', packet => prompts.push(packet.text));
	const result = await REFUSE.init(client({uid: 'bad'}));
	assert.equal(result, REFUSE._messages.checkVLA, 'init answers with the invalid VLA message');
	assert.ok(prompts.includes(REFUSE._messages.checkVLA), 'core prompts the invalid VLA message');
	assert.equal(REFUSE._active, false, 'the Deva stays offline');
	if (REFUSE.modules?.client) await REFUSE.modules.client.close();
});
