import { ethers, network } from "hardhat";
import { providers, Contract, Signer, BigNumber } from "ethers";

export function ether(amount: string) : BigNumber {
  return ethers.utils.parseEther(amount);
}

export async function increase(seconds: number) {
  const signers = await ethers.getSigners();
  const signer = signers[0];
  await (signer.provider as providers.JsonRpcProvider).send("evm_increaseTime", [seconds]);
}

export async function getBlockNumber() : Promise<BigNumber> {
  const signers = await ethers.getSigners();
  const signer = signers[0];
  const res = await (signer.provider as providers.JsonRpcProvider).send("eth_blockNumber", []);
  console.log(res.toString());
  return BigNumber.from(res);
}

export async function mine() {
  const signers = await ethers.getSigners();
  const signer = signers[0];
  await (signer.provider as providers.JsonRpcProvider).send("evm_mine", []);
}

export async function increaseTo(seconds: number) {
  const signers = await ethers.getSigners();
  const signer = signers[0];
  const current = await getTimestamp();
  const diff = BigNumber.from(seconds).sub(current);
  await (signer.provider as providers.JsonRpcProvider).send("evm_increaseTime", [diff.toNumber()]);
}

export async function getTimestamp() : Promise<BigNumber> {
  const signers = await ethers.getSigners();
  const signer = signers[0];
  const res = await (signer.provider as providers.JsonRpcProvider).send("eth_getBlockByNumber", ["latest", false]);
  return BigNumber.from(res.timestamp);
}

export async function impersonate(address: string) : Promise<Signer>{
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  return await ethers.getSigner(address);
}
