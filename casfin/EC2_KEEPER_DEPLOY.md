# EC2 Keeper Deployment Guide

This guide deploys the CasFin combined keeper to an AWS EC2 instance using the AWS CLI, AWS Systems Manager Session Manager, and PM2.

This version is CLI-first and does not require opening public HTTP, HTTPS, or SSH ports. The instance only needs outbound access to RPC, WebSocket, Redis, and API endpoints.

## 1. Prerequisites

- AWS CLI v2 installed and configured on your local machine
- Session Manager plugin installed locally if you want to use `aws ssm start-session`
- A reachable Git repository URL for this project
- Ubuntu Server 24.04 LTS
- Recommended instance type: `t3.micro`
- `t2.micro` is also fine if that is what your account or region is already using

Set a few local shell variables before you start:

```bash
export AWS_REGION=us-east-1
export INSTANCE_NAME=casfin-keeper
export INSTANCE_TYPE=t3.micro
export ROLE_NAME=casfin-keeper-ec2-role
export PROFILE_NAME=casfin-keeper-ec2-profile
export SG_NAME=casfin-keeper-sg
export REPO_URL=https://github.com/your-username/CasFin.git
```

All CLI examples below assume you are running them from the repo's `casfin/` directory.

## 2. Create the IAM Role for SSM Access

This lets you manage the instance through Systems Manager without exposing port 22.

```bash
aws iam create-role \
  --region "$AWS_REGION" \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document file://deploy/aws/ec2-assume-role-policy.json

aws iam attach-role-policy \
  --region "$AWS_REGION" \
  --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws iam create-instance-profile \
  --region "$AWS_REGION" \
  --instance-profile-name "$PROFILE_NAME"

aws iam add-role-to-instance-profile \
  --region "$AWS_REGION" \
  --instance-profile-name "$PROFILE_NAME" \
  --role-name "$ROLE_NAME"

sleep 10
```

If the role or instance profile already exists, reuse it instead of recreating it.

## 3. Create the Security Group

No inbound rules are required for the keeper when you use SSM Session Manager.

```bash
VPC_ID=$(aws ec2 describe-vpcs \
  --region "$AWS_REGION" \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' \
  --output text)

SUBNET_ID=$(aws ec2 describe-subnets \
  --region "$AWS_REGION" \
  --filters Name=vpc-id,Values="$VPC_ID" \
  --query 'Subnets[0].SubnetId' \
  --output text)

SG_ID=$(aws ec2 create-security-group \
  --region "$AWS_REGION" \
  --group-name "$SG_NAME" \
  --description "CasFin keeper security group" \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$SG_NAME}]" \
  --query 'GroupId' \
  --output text)
```

Optional SSH fallback from your current IP only:

```bash
aws ec2 authorize-security-group-ingress \
  --region "$AWS_REGION" \
  --group-id "$SG_ID" \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_PUBLIC_IP/32
```

## 4. Launch Ubuntu 24.04 from the AWS CLI

The command below uses Canonical's public SSM parameter for the latest Ubuntu 24.04 LTS AMI.

```bash
UBUNTU_AMI_PARAM=/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id

INSTANCE_ID=$(aws ec2 run-instances \
  --region "$AWS_REGION" \
  --image-id "resolve:ssm:$UBUNTU_AMI_PARAM" \
  --instance-type "$INSTANCE_TYPE" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --iam-instance-profile Name="$PROFILE_NAME" \
  --metadata-options 'HttpTokens=required,HttpEndpoint=enabled' \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":16,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "$INSTANCE_ID"
```

Wait for the instance to boot and pass health checks:

```bash
aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-status-ok --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
```

Wait for SSM to come online:

```bash
until [ "$(aws ssm describe-instance-information \
  --region "$AWS_REGION" \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text 2>/dev/null)" = "Online" ]; do
  echo "Waiting for SSM registration..."
  sleep 10
done
```

## 5. Open a Shell with AWS CLI

```bash
aws ssm start-session \
  --region "$AWS_REGION" \
  --target "$INSTANCE_ID"
```

Session Manager normally opens as `ssm-user`. Switch to the standard Ubuntu user before cloning the repo and configuring PM2:

```bash
sudo su - ubuntu
```

## 6. Install Node.js, PM2, and the Keeper

Run the following on the EC2 instance:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt-get install -y git curl

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo npm install -g pm2

git clone https://github.com/your-username/CasFin.git
cd CasFin/casfin

npm ci
npx tsc
```

If the repo is private, clone it with your deploy key or token-backed URL instead.

`npx tsc` is a validation step. The runtime itself starts from `npm run keeper:start`, which uses `ts-node`.

## 7. Configure the Keeper Environment

Create the root `.env` file in `CasFin/casfin`:

```bash
nano .env
```

Use the actual keeper variable names the runtime reads:

```env
PRIVATE_KEY=your_keeper_wallet_private_key
ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/your_alchemy_key
ARBITRUM_SEPOLIA_WSS_URL=wss://arb-sepolia.g.alchemy.com/v2/your_alchemy_key

ENCRYPTED_CASINO_VAULT_ADDRESS=0x...
ENCRYPTED_COIN_FLIP_ADDRESS=0x...
ENCRYPTED_DICE_GAME_ADDRESS=0x...
ENCRYPTED_CRASH_GAME_ADDRESS=0x...

MARKET_FACTORY_ADDRESS=0x...

REDIS_URL=redis://...
BALLDONTLIE_API_KEY=...

KEEPER_POLL_MS=5000
KEEPER_PREDICTION_POLL_MS=5000
KEEPER_START_BLOCK=0
KEEPER_EVENT_BATCH_BLOCKS=2000
```

Notes:

- `MARKET_FACTORY_ADDRESS` is needed if you want the prediction-market side of the combined keeper to run.
- `ARBITRUM_SEPOLIA_WSS_URL` is optional but recommended for push-based event subscriptions.
- `REDIS_URL` is optional. Without it, bet-event publishing is disabled.
- `BALLDONTLIE_API_KEY` is only needed for sports-market resolution flows.
- `ENCRYPTED_CASINO_VAULT_ADDRESS` is optional but recommended so the keeper can run the vault solvency guard.

## 8. Start with PM2

This repo includes [`ecosystem.config.cjs`](./ecosystem.config.cjs) for the keeper process.

Start the bot:

```bash
pm2 start ecosystem.config.cjs --only casfin-keeper
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

If PM2 prints a slightly different startup command for your machine, run the command PM2 gives you once and then run `pm2 save` again.

## 9. Monitoring and Operations

From the EC2 instance:

```bash
pm2 status
pm2 logs casfin-keeper
pm2 restart casfin-keeper --update-env
pm2 monit
```

From your local machine:

```bash
aws ssm start-session --region "$AWS_REGION" --target "$INSTANCE_ID"
```

To get the instance public IP later, if you enabled SSH fallback:

```bash
aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text
```

## 10. Redeploying Code

For a normal keeper update:

```bash
aws ssm start-session --region "$AWS_REGION" --target "$INSTANCE_ID"
sudo su - ubuntu
cd ~/CasFin/casfin
git pull
npm ci
pm2 restart casfin-keeper --update-env
```

If ABI files or TypeScript types changed significantly, rerun:

```bash
npx tsc
```

## 11. Cleanup

When you are done:

```bash
aws ec2 terminate-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
```

If you want to remove the supporting IAM and networking resources too, delete the instance profile, role, and security group after the instance is gone.
