// Copyright (c)2025 Quinn Michaels
// Legal Deva is responsible for the Vedic Tradition Laws.
import Deva from '@indra.ai/deva';
import { MongoClient, ObjectId } from 'mongodb';

import pkg from './package.json' with {type:'json'};

import data from './data.json' with {type:'json'};
const {agent,vars} = data.DATA;

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
    func: view
    params: opts
    describe: The view function parses the text parameter to produce the string
    which calls the correct document file then passes it to the feecting deva
    for parsing.
    ***************/
    file(opts) {
      this.action('func', 'file');
      const {text, meta} = opts;
      const area = meta.params[1] ? meta.params[1] : this.vars.area;
      const part = meta.params[2] ? meta.params[2].toUpperCase() : this.vars.part;
      const docName = text.length ? text + '.feecting' : 'main.feecting';
      const docPath = this.lib.path.join(this.config.dir, area, 'legal', docName);
      try {
        let doc = this.lib.fs.readFileSync(docPath, 'utf8');
        if (part) doc = doc.split(`::BEGIN:${part}`)[1].split(`::END:${part}`)[0];
        this.state('return', 'file')
        return doc;
      }
      catch (err) {
        return err;
      }
    },

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
        const hasIdx = idx.find(i => i.name === this.vars.laws.index)
        if (!hasIdx) {
          const newIdx = await table.createIndex({"content": "text"}, {name: this.vars.laws.index});
        }
    
        const query  = {$text:{$search:opts.text}};
        const projection  = {
          _id:0,
          a: {
            id: 1,
            text: 1
          },
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
    method: file
    params: packet
    describe: The view method replays the request to the view function to return
    a document from the text parameter.
    ***************/
    file(packet) {      
      this.context('file', packet.q.text);
      this.action('method', `file:${packet.q.text}`);
      const agent = this.agent();
      return new Promise((resolve, reject) => {
        this.state('get', packet.q.text);
        const doc = this.func.file(packet.q);
        this.question(`${this.askChr}feecting parse ${doc}`).then(feecting => {
          this.state('resolve', `file:${packet.q.text}`);
          return resolve({
            text: feecting.a.text,
            html: feecting.a.html,
            data: feecting.a.data,
          });
        }).catch(err => {
          this.context('reject', `file:${packet.q.text}`);
          return this.error(err, packet, reject);
        })
      });
    },    

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
            data: ins,
          });
        }).catch(err => {
          this.state('reject', 'add');
          return this.error(err, packet, reject);
        });
      });
    },
    /**************
    method: history
    params: packet
    describe: get history
    ***************/
    search(packet) {
      this.context('search', packet.q.text);
      this.action('method', `search:${packet.q.text}`);
      return new Promise((resolve, reject) => {
        if (!packet.q.text) return resolve(this._messages.notext);
        const {params} = packet.q.meta;
        if (params[1]) this.vars.laws.limit = packet.q.meta.params[1];
    
        this.func.search(packet.q).then(search => {
          this.state('resolve', `search:${packet.q.text}`);
          console.log('search results:', search);
          return resolve({
            text: 'see data',
            html: 'see data',
            data: search,
          })
        }).catch(err => {
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
  onError(err, data, reject) {
    this.prompt(this.vars.messages.error);
    console.log(err);
    return reject(err);
  },
});
export default LEGAL
