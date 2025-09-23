"use strict";
// Copyright ©2025 Quinn A Michaels; All rights reserved. 
// Legal Signature Required For Lawful Use.
// Distributed under VLA:68994788488631656689 LICENSE.md

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