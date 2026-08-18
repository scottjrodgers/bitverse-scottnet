const EMPTY_PORT = "NULL PORT DATA";

export const SERVER_PORTS = {
  'mcp': 0,
  'hub': 1,
  'DFO': 3,
  'hgw': 4,
  'augs': 5,
  'bladeburner': 6,
  'hacknet': 7,
  'gangs': 8,
  'stocks': 9,
  'ipGO': 10,
  'corporations': 11,
  'tools': 12,
  'd1': 20,
  'd2': 21,
  'logs': 22,
};

export const SYSMSG={
  'PAUSE':'PAUSE',
  'RESUME':'RESUME',
  'STATUS':'STATUS',
  'SHUTDOWN':'SHUTDOWN',
};

const SYSTEM = "SYSTEM";

export class Message{
  /**
   * @param {string} sender
   * @param {string} recipient
   * @param {string} messageType
   * @param {any} data
   * @param {string} id
   */
  constructor(sender, recipient, messageType, data, id=undefined){
    this.ts = Date.now();
    this.id = id;
    this.messageType = messageType;
    this.sender = sender;
    this.recipient = recipient;
    this.data = data;
    this.reply = false;
  }

  /**
   * @param {{ [x: string]: any; }} msg
   */
  static fromDict(msg){
    const sender = msg['sender'];
    const recipient = msg['recipient'];
    const messageType = msg['message_type'];
    const data = msg['data'];
    const id = msg['id'];
    const ts = msg['ts'];
    const reply = msg['reply'];
    const newMessage = new Message(sender, recipient, messageType, data, id);
    newMessage.ts = ts;
    newMessage.reply = reply
    return newMessage;
  }

  toDict(){
    const msg = {}
    msg['ts'] = this.ts;
    msg['id'] = this.id;
    msg['message_type'] = this.messageType;
    msg['sender'] = this.sender;
    msg['recipient'] = this.recipient;
    msg['data'] = this.data;
    msg['reply'] = this.reply;
    return msg;
  }

  /**
   * @param {any} replyData
   */
  makeReply(replyData){
    const replyMsg = new Message(this.recipient, this.sender, this.messageType, replyData, this.id);
    replyMsg.reply = true;
    return replyMsg;
  }

  /**
   * @param {any} hint
   */
  // @ts-ignore
  [Symbol.toPrimative](hint){
    return this.ts;
  }
}


export class CommCenter{
  /**
   * @param {any} ns
   * @param {string} server_id
   */
  constructor(ns, server_id){
    this.ccNS = ns;
    if(!(server_id in SERVER_PORTS)){
      this.ccNS.tprintf("ERROR: Unknown server ID: '%s'!", server_id);
      this.ccNS.exit(1);
    }
    this.server_id = server_id;
    this.port = SERVER_PORTS[server_id];
    this.systemInbox = [];
    this.inbox = []
  }

  checkPort(){
    while(this.ccNS.peek(this.port) != EMPTY_PORT){
      const messageDict = this.ccNS.readPort(this.port);
      this.ccNS.tprintf("%s", JSON.stringify(messageDict));
      const message = Message.fromDict(messageDict);
      const msgType = message.messageType
      if(msgType == SYSTEM){
        this.systemInbox.push(message);
      } else {
        this.inbox.push(message);
      }
    }
  }

  /**
   * @param {string} recipient
   * @param {any} data
   */
  sendMessage(recipient, data, messageType=undefined, message_id=undefined){
    if(!(recipient in SERVER_PORTS)){
      this.ccNS.tprintf("Recipient '%s' not known!", recipient);
      this.ccNS.exit(1);
    }
    const message = new Message(this.server_id, recipient, messageType, data, message_id);
    const chk = this.ccNS.writePort(SERVER_PORTS[message.recipient], message.toDict());
  }

  getSystemMessages(){
    const messageArray = this.systemInbox;
    this.systemInbox = [];
    return messageArray;
  }

  getMessages(){
    const messageArray = this.inbox;
    this.inbox = [];
    return messageArray;
  }
}