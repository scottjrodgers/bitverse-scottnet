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
  'logs': 12,
  'd1': 13,
  'd2': 14,
}


export class MessageQueue{
  constructor(size){
    this.array_size = size;
    this.queue = new Array(size);
    this.headIndex = 0;
    this.tailIndex = 0;
  }

  enqueue(x){
    this.queue[this.tailIndex] = element;
 
    if(this.tailIndex == this.headIndex){
      ns.tprintf("FATAL: Queue overflow!");
      ns.exit(1);
    }
  }

  dequeue(){
    const item = this.queue[this.headIndex];
    this.queue[this.headIndex] == undefined;
    this.headIndex = (this.headIndex + 1) % this.array_size;
    return item;
  }

  peek(){
    return this.queue[this.headIndex];
  }

  capacity(){
    return this.array_size;
  }

  size(){
    let s = this.tailIndex - this.headIndex;
    if(s < 0){
      s += this.array_size;
    }
    return s;
  }

  isEmpty(){
    return this.size() === 0;
  }
}


export class Message{
  constructor(sender, recipient, messageType, data, id=undefined){
    this.ts = Date.now();
    this.id = id;
    this.messageType = messageType;
    this.sender = sender;
    this.recipient = recipient;
    this.data = data;
    this.reply = false;
  }

  static fromDict(msg){
    const newMessage = new Message(msg['sender'], msg['recipient'], msg['message_type'], 
                                   msg['data'], msg['id']);
    newMessage.ts = msg['ts'];
    newMessage.reply = msg['reply'];
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

  makeReply(replyData){
    const replyMsg = new Message(this.recipient, this.sender, this.messageType, replyData, this.id);
    replyMsg.reply = true;
    return replyMsg;
  }

  [Symbol.toPrimative](hint){
    return this.ts;
  }
}


export class CommCenter{
  constructor(ns, server_id){
    this.ccNS = ns;
    if(!(server_id in SERVER_PORTS)){
      this.ccNS.tprintf("ERROR: Unknown server ID: '%s'!", server_id);
      this.ccNS.exit(1);
    }
    this.server_id = server_id;
    this.port = SERVER_PORTS[server_id];
    this.folders = {};
  }

  checkPort(){
    while(this.ccNS.peek(this.port) != EMPTY_PORT){
      const messageDict = this.ccNS.readPort(this.port);
      this.ccNS.tprintf("%s", JSON.stringify(messageDict));
      const message = Message.fromDict(messageDict);
      const msgType = message.messageType
      if(!(msgType in this.folders)){
        this.folders[msgType] = [];
      }
      this.folders[msgType].push(message);
    }
  }

  sendMessage(recipient, data, messageType=undefined, message_id=undefined){
    if(!(recipient in SERVER_PORTS)){
      this.ccNS.tprintf("Recipient '%s' not known!", recipient);
      this.ccNS.exit(1);
    }
    // const message = this.buildMessage(recipient, message_type, data, message_id);
    const message = new Message(this.server_id, recipient, messageType, data, message_id);
    const chk = this.ccNS.writePort(SERVER_PORTS[message.recipient], message.toDict());
  }

  getMessagesByType(messageType){
    if(!(messageType in this.folders)){
      return [];
    }
    const messageArray = this.folders[messageType];
    this.folders[messageType] = [];
    return messageArray;
  }

  getAllMessages(){
    let all = [];
    for(const key in this.folders){
      const folder = this.folders[key];
      for(const msg of folder){
        all.push(msg);
      }
    }
  }
}