// Copyright (c)2025 Quinn Michaels
// Legal Deva is responsible for the Vedic Tradition Laws.
import Deva from '@indra.ai/deva';
import { MongoClient, ObjectId } from 'mongodb';

import pkg from './package.json' with {type:'json'};
const {agent,vars} = pkg.data;

// set the __dirname
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';    
const __dirname = dirname(fileURLToPath(import.meta.url));

const info = {
  id: pkg.id,
  name: pkg.name,
  describe: pkg.description,
  version: pkg.version,
  url: pkg.homepage,
  dir: __dirname,
  git: pkg.repository.url,
  bugs: pkg.bugs.url,
  author: pkg.author,
  license: pkg.license,
  copyright: pkg.copyright,
};

const LEGAL = new Deva({
  info,
  agent,
  vars,
  utils: {
    translate(input) {return input.trim();},
    parse(input) {return input.trim();},
    process(input) {return input.trim();}
  },
  listeners: {},
  modules: {
    client: false,
  },
  deva: {},
  func: {
    /**************
    func: insert
    params: opts
    describe: the insert function that inserts into the specified collection.
    ***************/
    async insert(opts) {
      this.action('func', `insert`);
      let result = false;
      try {
        this.state('insert', opts.collection);
        await this.modules.client.connect(); // connect to the database client.
        const db = this.modules.client.db(this.vars.database);  // set the database to use
        result = await db.collection(opts.collection).insertOne(opts.data); // insert the data
      } finally {
        await this.modules.client.close(); // close the connection when done
        this.state('return', 'insert');
        return result; // return the result to the requestor.
      }
    },
    
    /**************
    func: update
    params: opts
    describe: the update function that update into the specified collection.
    ***************/
    async update(opts) {
      this.action('func', 'update');
      let result = false;
      try {
        this.state('update', opts.collection);
        await this.modules.client.connect(); // connect to the database client.
        const db = this.modules.client.db(this.vars.database);  // set the database to use
        result = await db.collection(opts.collection).updateOne(
          { _id: new ObjectId(`${opts.id}`) },
          { $set: opts.data }
        ); // insert the data
      } finally {
        await this.modules.client.close(); // close the connection when done
        this.state('return', 'update');
        return result; // return the result to the requestor.
      }
    },    
    /**************
    func: search
    params: obj - the search object
    describe: return a search from the database collection.
    ***************/
    async search(opts) {
      this.action('func', 'search');
      let result = false;
      const {collection,limit} = this.vars.laws;
      try {
        this.state('search', opts.text);
        await this.modules.client.connect();
        const db = this.modules.client.db(this.vars.database);
        const table = db.collection(collection);

        // await table.dropIndex('a_text_q_text');
        const idx = await table.listIndexes().toArray();
        const hasIdx = idx.find(i => i.name === this.vars.laws.index) ? true : false;

        if (!hasIdx) {
          const newIdx = await table.createIndex({"content": "text"}, {name: this.vars.laws.index});
        }
    
        const query  = {$text:{$search:opts.text}};
        const projection  = {
          _id: 0,
          content: 1,
          score: { $meta: "textScore" }
        };
        result = await table.find(query).project(projection).limit(limit).toArray();
      } finally {
        await this.modules.client.close();
        this.state('return', 'search');
        return result;
      }
    },
  },
  methods: {
    /**************
    method: add
    params: packet
    describe: add data to the knowledge base
    example: #legal add:[id] [content to store in memory]
    params[1] is the law id to update blank if new.
    ***************/
    add(packet) {
      this.context('add', `law: ${packet.q.meta.params[1]}`);
    
      return new Promise((resolve, reject) => {
        if (!packet.q.text) return resolve(this._messages.notext);
        this.vars.laws.content = packet.q.text; // store text in local
    
        const {meta, text} = packet.q;
        let func = 'insert', id = false;
        const {collection, content} = this.vars.laws;
        const data = {content};
    
        // if param[1] id is found then update record
        if (meta.params[1]) {
          id = meta.params[1];
          func = 'update';
          data.modified = Date.now();
        }
        else {
          data.modified = null;
          data.created = Date.now();
        }
    
        this.func[func]({id,collection,data}).then(ins => {
          this.state('resolve', 'add');
          return resolve({
            text: `id: ${ins.insertedId || id}`,
            html: `id: ${ins.insertedId || id}`,
            data: `${ins.insertedId || id}`,
          });
        }).catch(err => {
          this.state('reject', 'add');
          return this.error(err, packet, reject);
        });
      });
    },
    /**************
    method: searck
    params: packet
    describe: get history
    ***************/
    search(packet) {
      this.context('search', packet.q.text);
      this.action('method', `search:${packet.q.text}`);
      const data = {};
      return new Promise((resolve, reject) => {
        if (!packet.q.text) return resolve(this._messages.notext);
        const {params} = packet.q.meta;
        if (params[1]) this.vars.laws.limit = packet.q.meta.params[1];
    
        this.func.search(packet.q).then(search => {
          data.search = search;
          this.state('resolve', `search:${packet.q.text}`);
          const search_text = search.map(itm => {return `law: ${itm.content}`}).join('\n');
          const search_box = [
            `::begin:search:${packet.id}`,
            search_text,
            `::end:search:${this.lib.hash(search_text)}`,
          ].join('\n');
          return this.question(`${this.askChr}feecting parse ${search_box}`);
        }).then(feecting => {
          data.feecting = feecting.a.data;
          this.state('resolve', 'search');
          return resolve({
            text: feecting.a.text,
            html: feecting.a.html,
            data,
          });
        }).catch(err => {
          this.state('reject', 'search');
          return this.error(packet, err, reject);
        });
      });
    },
  },
  onReady(data, resolve) {
    const {uri,database} = this.services().personal.mongo;
    this.modules.client = new MongoClient(uri);
    this.vars.database = database;
    this.prompt(this.vars.messages.ready);
    return resolve(data);
  },
  onError(err, data) {
    this.prompt(this.vars.messages.error);
    console.log(err);
  },
});
export default LEGAL
