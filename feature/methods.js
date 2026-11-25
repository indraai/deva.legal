"use strict";
// Legal Deva Feature Methods
// Copyright ©2000-2026 Quinn Michaels; All rights reserved. 
// Owner Signature Required For Lawful Use.
// Distributed under VLA:38081583681664078895 LICENSE.md
// Tuesday, November 24, 2026 - 11:49:58 AM PST

export default {
  /**************
  method: legal
  params: packet
  describe: The global legal feature that installs with every agent
  ***************/
  async legal(packet) {
    const legal = await this.methods.sign('legal', 'default', packet);
    return legal;
  },
};