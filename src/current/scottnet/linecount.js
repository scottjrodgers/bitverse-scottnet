/** @param {NS} ns */
export async function main(ns) {
  if(ns.args.length < 1){
    ns.tprintf("linecount <filename>");
    ns.exit();
  }

  const filename = ns.args[0];
  let fileData = ns.read(filename);
  let rows = fileData.split("\n");
  let counter = 0;
  for (const line of rows){
    counter = counter + 1
  }
  // ns.tprintf("%s", fileData);
  ns.tprintf("\n%s: %d lines", filename, counter);
}