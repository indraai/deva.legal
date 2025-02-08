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
      const data = {};
      this.question(`#docs raw feature/legal`).then(doc => {
        data.doc = doc.a.data;
        const info = [
          `## Legal`,
          `::begin:legal:${legal.id}`,
          `client: ${legal.client_name}`,
          `concerns: ${legal.concerns.join(', ')}`,
          `::end:legal:${this.hash(legal)}`,
        ].join('\n');
        const text = doc.a.text.replace(/::info::/g, info)
        return this.question(`#feecting parse ${text}`)
      }).then(feecting => {
        return resolve({
          text: feecting.a.text,
          html: feecting.a.html,
          data: legal
        });
      }).catch(err => {
        return this.error(err, packet, reject);
      })
    });
  },
};
