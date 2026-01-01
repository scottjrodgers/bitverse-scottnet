# Bitburner

## "Conversation" I want to be able to have (through commands)
- me
  - What servers are prepared for attack?  (meaning at or near minimum security and maximum money)
- machine
  - only 'n00dles' and 'zer0' are properly prepared.
- me
  - Prepare 'max-hardware' using 10% of my RAM.
  - Prepare 'silver-helix' using 512 GB
- machine
  - (after some time)
  - Server 'max-hardware' is prepared for attack.
  - (after some more time)
  - Server 'silver-helix' is prepared for attack.
- me
  - How hard can I attack 'max-hardware'?
- machine
  - With 3.84 TB available, you could run 112 hack, 635 grow, and 347 weaken jobs netting roughly $245m / minute.
- me
  - Attack 'max-hardware' at 20 hacks/minute.
- 

## Major Threads
- Unlocking key augments for hacking experience
- Unlocking key augments for reputation gain
- Unlocking key augments for cash generation
- Generating cash for server upgrades

## Infrastructure
### Process Management
I want to be able to deploy scripts as jobs to any available server with free RAM.  
Jobs will be managed as part of an overall program.  Using library code to manage
the individual job threads on their respective servers.

- Need to have a Job class that contains:
  - the script name
  - the arguments
  - the server it's running on 
  - the required ram
  - the thread count
  - PID number
- Need to have a Server class that pulls and stores:
  - server name
  - Max RAM
  - Free RAM
  - list of running jobs
  - which ports are open
  - number of ports required to nuke
  - shortest path to get from home to the server
  - if we have root access
  - if a backdoor is installed
  - functions to deploy job to that server
  - function to apply available exploits and nuke if ready
  - function to update free ram and running jobs
- Need to have a Program class that contains:
  - list of all jobs that are running for this program
  - function to scan and update server list
  - function to deploy jobs to available servers
  - function to monitor running jobs and re-deploy if needed
- Need a library for managing cross-process communication
  - Bitburner standard for this is the use of globally available ports (1 - 20) which are FIFO queues.