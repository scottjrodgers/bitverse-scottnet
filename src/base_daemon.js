import { CommCenter, SYSMSG } from "lib/communications";
import { MessageQueue } from "src/lib/message_queue";


const STATUS = {
  RUNNING: "RUNNING",
  STOPPED: "STOPPED",
  PAUSED: "PAUSED"
}

class BaseDaemon{
  /**
   * @param {NS} ns
   * @param {string} serverName
   */
  constructor(ns, serverName){
    this.sNS = ns;
    this.serverName = serverName;
    this.coms = new CommCenter(ns, serverName);
    this.status = STATUS.STOPPED
    this.mq = new MessageQueue(ns, 100);
  }

  // Override these methods
  async startUp(){

  }

  async shutDown(){

  }

  async loopBody(){
  }


  // Main loop, call to start the daemon
  async run(){
    this.startUp();
    this.status = STATUS.RUNNING;
    await this.__mainloop();
    this.shutDown();
  }

  // Utility methods
  hasMessage(){
    return !this.mq.isEmpty();
  }

  getMessage(){
    return this.mq.dequeue();
  }

  /**
   * Send a message to another daemon
   * @param {string} recipient
   * @param {string} messageType
   * @param {any} data
   * @param {string} id
   */
  sendMessage(recipient, data, messageType=undefined, id=undefined){
    this.coms.sendMessage(recipient, data, messageType, id);
  }

  // Internal methods
  async __mainloop(){
    while(this.status != STATUS.STOPPED){
      this.__processMessages();
      if(this.status == STATUS.RUNNING){
        await this.loopBody();
      }
      await this.sNS.sleep(1000)
    }
  }

  __processMessages(){
    this.coms.checkPort();
    const systemMessages = this.coms.getSystemMessages();
    const messages = this.coms.getMessages();
    for(const msg of systemMessages){
      const msgData = msg.data;
      if(msgData == SYSMSG.PAUSE){
        this.status = STATUS.PAUSED;
      } else if(msgData == SYSMSG.RESUME){
        this.status = STATUS.RUNNING;
      } else if(msgData == SYSMSG.SHUTDOWN){
        this.status = STATUS.STOPPED;
      } else if(msgData == SYSMSG.STATUS){
        this.coms.sendMessage(this.serverName, msg.sender, SYSMSG.STATUS, this.status);
      } else {
        // Unknown system message, re-enqueue it for handling by the daemon
        this.mq.enqueue(msg);
      }
    }
    for (const msg of messages){
      this.mq.enqueue(msg);
    }
  }
}