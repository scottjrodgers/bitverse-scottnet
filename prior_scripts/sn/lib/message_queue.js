export class MessageQueue{
  /**
   * @param {NS} ns
   * @param {number} size
   */
  constructor(ns, size){
    this.ns = ns;
    this.array_size = size;
    this.queue = new Array(size);
    this.headIndex = 0;
    this.tailIndex = 0;
  }

  /**
   * @param {any} x
   */
  enqueue(x){
    this.queue[this.tailIndex] = x;
    this.tailIndex = (this.tailIndex + 1) % this.array_size;
    if(this.tailIndex == this.headIndex){
      this.ns.tprintf("FATAL: Queue overflow!");
      this.ns.exit();
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

