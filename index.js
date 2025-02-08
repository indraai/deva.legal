// Copyright (c)2025 Quinn Michaels
// Legal Deva is responsible for the Vedic Tradition Laws.
import Deva from '@indra.ai/deva';
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
  modules: {},
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
          this.state('resolve', `view:${packet.q.text}`);
          return resolve({
            text: feecting.a.text,
            html: feecting.a.html,
            data: feecting.a.data,
          });
        }).catch(err => {
          this.context('reject', `view:${packet.q.text}`);
          return this.error(err, packet, reject);
        })
      });
    },
    
  },
  onDone(data, resolve) {
    
  },
  onError(err, data, reject) {
    console.log('LEGAL ERROR', err);
    return reject(err);
  }
});
export default LEGAL
