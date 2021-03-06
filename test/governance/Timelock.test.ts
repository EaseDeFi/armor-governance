import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer, BigNumber, constants } from "ethers";
import { getTimestamp, increase, mine } from "../utils";

describe("Timelock", function(){
  let timelock: Contract;
  let token: Contract;
  let gov: Signer;
  let anon: Signer;
  let data: string;
  beforeEach(async function(){
    const accounts = await ethers.getSigners();
    gov = accounts[0];
    anon = accounts[2];
    const TimelockFactory = await ethers.getContractFactory("Timelock");
    timelock = await TimelockFactory.deploy(gov.getAddress(), 86400 * 2);
    const TokenFactory = await ethers.getContractFactory("ERC20Mock");
    token = await TokenFactory.deploy();
    await token.transfer(timelock.address, 100);
    const abiCoder = new ethers.utils.AbiCoder();
    data = abiCoder.encode(["address","uint256"],[await anon.getAddress(), 100]);
  });

  describe("#queueTransaction", function(){
    it("should fail if msg.sender is not gov", async function(){
      const timestamp = await getTimestamp();
      await expect(timelock.connect(anon).queueTransaction(token.address, 0, "transfer(address,uint256)", data, timestamp.add(86400*3))).to.be.revertedWith("Timelock::queueTransaction: Call must come from governance.");
    });
    it("should fail if eta is too soon", async function(){
      const timestamp = await getTimestamp();
      await expect(timelock.connect(gov).queueTransaction(token.address, 0, "transfer(address,uint256)", data, timestamp.add(86400))).to.be.revertedWith("Timelock::queueTransaction: Estimated execution block must satisfy delay.");
    });
    it("should set tx hash as queued", async function(){
      const timestamp = await getTimestamp();
      await timelock.connect(gov).queueTransaction(token.address, 0, "transfer(address,uint256)", data, timestamp.add(86400 * 3));
      const abiCoder = new ethers.utils.AbiCoder();
      const hash = ethers.utils.keccak256(abiCoder.encode(["address","uint256","string","bytes","uint256"],[token.address,0,"transfer(address,uint256)",data,timestamp.add(86400*3)]));
      expect(await timelock.queuedTransactions(hash)).to.equal(true);
    });
  });

  describe("#cancelTransaction", function(){
    let eta : BigNumber;
    beforeEach(async function(){
      const timestamp = await getTimestamp();
      eta = timestamp.add(86400*3);
      await timelock.connect(gov).queueTransaction(token.address, 0, "transfer(address,uint256)", data, eta);
      const abiCoder = new ethers.utils.AbiCoder();
      const hash = ethers.utils.keccak256(abiCoder.encode(["address","uint256","string","bytes","uint256"],[token.address,0,"transfer(address,uint256)",data,eta]));
      expect(await timelock.queuedTransactions(hash)).to.equal(true);
    });

    it("should fail if msg.sender is not gov", async function(){
      await expect(timelock.connect(anon).cancelTransaction(token.address, 0, "transfer(address,uint256)", data, eta)).to.be.revertedWith("Timelock::cancelTransaction: Call must come from governance.");
    });
    it("should set tx hash as not queued", async function(){
      await timelock.connect(gov).cancelTransaction(token.address, 0, "transfer(address,uint256)", data, eta);
      const abiCoder = new ethers.utils.AbiCoder();
      const hash = ethers.utils.keccak256(abiCoder.encode(["address","uint256","string","bytes","uint256"],[token.address,0,"transfer(address,uint256)",data,eta]));
      expect(await timelock.queuedTransactions(hash)).to.equal(false);
    });
  });

  describe("#executeTransaction", function(){
    let eta : BigNumber;
    beforeEach(async function(){
      const timestamp = await getTimestamp();
      eta = timestamp.add(86400*3);
      await timelock.connect(gov).queueTransaction(token.address, 0, "transfer(address,uint256)", data, eta);
      const abiCoder = new ethers.utils.AbiCoder();
      const hash = ethers.utils.keccak256(abiCoder.encode(["address","uint256","string","bytes","uint256"],[token.address,0,"transfer(address,uint256)",data,eta]));
      expect(await timelock.queuedTransactions(hash)).to.equal(true);
    });

    it("should fail if msg.sender is not gov", async function(){
      await increase(86400 * 4);
      await expect(timelock.connect(anon).executeTransaction(token.address, 0, "transfer(address,uint256)", data, eta)).to.be.revertedWith("Timelock::executeTransaction: Call must come from governance.");
    });
    
    it("should fail if tx is not queued", async function(){
      await increase(86400 * 4);
      await expect(timelock.connect(gov).executeTransaction(token.address, 1, "transfer(address,uint256)", data, eta)).to.be.revertedWith("Timelock::executeTransaction: Transaction hasn't been queued.");
    });

    it("should fail if eta hasn't passed", async function(){
      await expect(timelock.connect(gov).executeTransaction(token.address, 0, "transfer(address,uint256)", data, eta)).to.be.revertedWith("Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
    });
    
    it("should fail if grace period has passed", async function(){
      await increase(86400 * 20);
      await expect(timelock.connect(gov).executeTransaction(token.address, 0, "transfer(address,uint256)", data, eta)).to.be.revertedWith("Timelock::executeTransaction: Transaction is stale.");
    });

    it("should set tx hash as not queued", async function(){
      await increase(86400 * 4);
      await timelock.connect(gov).executeTransaction(token.address, 0, "transfer(address,uint256)", data, eta);
      const abiCoder = new ethers.utils.AbiCoder();
      const hash = ethers.utils.keccak256(abiCoder.encode(["address","uint256","string","bytes","uint256"],[token.address,0,"transfer(address,uint256)",data,eta]));
      expect(await timelock.queuedTransactions(hash)).to.equal(false);
    });
  });
});
