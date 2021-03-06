import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { Contract, Signer, BigNumber, constants } from "ethers";
import { getBlockNumber, getTimestamp, increase, mine } from "../utils";

const duration = {
  seconds: function (val: Number) { return BigNumber.from(val); },
  minutes: function (val: Number) { return BigNumber.from(val).mul(this.seconds('60')); },
  hours: function (val: Number) { return BigNumber.from(val).mul(this.minutes('60')); },
  days: function (val: Number) { return BigNumber.from(val).mul(this.hours('24')); },
  weeks: function (val: Number) { return BigNumber.from(val).mul(this.days('7')); },
  years: function (val: Number) { return BigNumber.from(val).mul(this.days('365')); },
};

describe("Governance", function(){
  let timelock: Contract;
  let token: Contract;
  let varmor: Contract;
  let gov: Contract;
  let admin: Signer;
  let against: Signer;
  let anon: Signer;
  let data: string;

  beforeEach(async function(){
    const accounts = await ethers.getSigners();
    admin = accounts[1];
    anon = accounts[2];
    against = accounts[3];
    const TokenFactory = await ethers.getContractFactory("ERC20Mock");
    token = await TokenFactory.deploy();
    const VArmorFactory = await ethers.getContractFactory("vARMOR");
    varmor = await VArmorFactory.deploy(token.address, admin.getAddress());
    const TimelockFactory = await ethers.getContractFactory("Timelock");
    timelock = await TimelockFactory.deploy(admin.getAddress(), 86400 * 2);
    const GovernanceFactory = await ethers.getContractFactory("GovernorAlpha");
    gov = await GovernanceFactory.deploy(admin.getAddress(), timelock.address, varmor.address, "10000000000000000", "10000000000000000");
    const abiCoder = new ethers.utils.AbiCoder();
    const eta = (await getTimestamp()).add(86400*2 + 100);
    await timelock.connect(admin).queueTransaction(timelock.address, 0, "setPendingGov(address)", abiCoder.encode(["address"], [gov.address]), eta);
    await increase(86400*2 + 101);
    await timelock.connect(admin).executeTransaction(timelock.address, 0, "setPendingGov(address)", abiCoder.encode(["address"], [gov.address]), eta);
    await gov.connect(admin).acceptTimelockGov();
    await gov.connect(admin).propose([gov.address], [BigNumber.from(0)], [""], [gov.interface.encodeFunctionData('setVotingPeriod', [BigNumber.from(40320)])], "testing");
    await gov.connect(admin).queue(BigNumber.from(1));
    await increase(duration.days(3).toNumber());
    await gov.connect(admin).execute(BigNumber.from(1));
    await increase(86400*2 + 101);

    await token.transfer(admin.getAddress(), "10000000000000000");
    await token.connect(admin).approve(varmor.address, "10000000000000000");
    await varmor.connect(admin).deposit("10000000000000000");
    await mine();
    await varmor.connect(admin).delegate(admin.getAddress());

    await token.transfer(timelock.address, 100);
    data = abiCoder.encode(["address","uint256"],[varmor.address, 100]);
  });

  describe("#reject", function(){
    it("should be able to reject admin's proposal", async function(){
      await token.transfer(against.getAddress(), "20000000000000000");
      await token.connect(against).approve(varmor.address, "20000000000000000");
      await varmor.connect(against).deposit("20000000000000000");
      await mine();
      await varmor.connect(against).delegate(against.getAddress());
      await mine();
      await gov.connect(admin).propose([token.address], [0], ["transfer(address,uint256)"],[data], "going through with admin priv");
      await gov.connect(admin).queue(2);
      console.log(await gov.state(2));
      await gov.connect(against).castVote(2, false);
      let mining = [];

      for(let i = 0; i <= 40320; i++){
        mining.push(mine());
      }

      await Promise.all(mining);

      await gov.connect(against).reject(2);
      await increase((86400*2 + 101));
      await expect(gov.connect(admin).execute(2)).to.be.reverted;
    });
    it("should be able to reject dao's proposal", async function(){
      await token.transfer(against.getAddress(), "20000000000000000");
      await token.connect(against).approve(varmor.address, "20000000000000000");
      await varmor.connect(against).deposit("20000000000000000");
      await mine();
      await varmor.connect(against).delegate(against.getAddress());
      await gov.connect(against).propose([token.address], [0], ["transfer(address,uint256)"],[data], "going through with admin priv");
      await mine();
      await mine();
      console.log(await gov.state(2));
      await gov.connect(against).castVote(2, true);
      let mining = [];
      for(let i = 0; i <= 40320; i++){
        mining.push(mine());
      }

      await gov.connect(against).queue(2);
      await Promise.all(mining);
      await increase((86400*2 + 101));

      await gov.connect(admin).cancel(2);
      await expect(gov.connect(against).execute(2)).to.be.reverted;
    });
  });
});
