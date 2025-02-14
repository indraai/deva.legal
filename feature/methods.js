export default {
  /**************
  method: Legal
  params: packet
  describe: The global service feature that installs with every agent
  ***************/
  legal(packet) {
    this.context('feature');
    return new Promise((resolve, reject) => {
      const legal = this.legal();
      const agent = this.agent();
      const global = [];
      legal.global.forEach((item,index) => {
        global.push(`::begin:global:${item.key}:${item.id}`);
        for (let x in item) {
          global.push(`${x}: ${item[x]}`);
        }
        global.push(`::end:global:${item.key}:${this.lib.hash(item)}`);
      });
      const concerns = [];
      legal.concerns.forEach((item, index) => {
        concerns.push(`${index + 1}. ${item}`);
      })
      
      const info = [
        '::BEGIN:LEGAL',
        '### Client',
        `::begin:client:${legal.client_id}`,
        `id: ${legal.client_id}`,
        `client: ${legal.client_name}`,
        '**concerns**',
        concerns.join('\n'),
        `::end:client:${this.lib.hash(legal)}`,
        '### Global',
        global.join('\n'),
        '::END:LEGAL'
      ].join('\n');
      this.question(`${this.askChr}feecting parse ${info}`).then(feecting => {
        return resolve({
          text: feecting.a.text,
          html: feecting.a.html,
          data: legal.concerns,
        });
      }).catch(err => {
        return this.error(err, packet, reject);
      })
    });
  },
};
