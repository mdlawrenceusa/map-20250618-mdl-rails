import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

export class ServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // IP address for whitelisting.
    const myIp = process.env.MY_IP!;

    // Domain name for SSL certificate (required for SSL)
    const domainName = process.env.SERVER_URL!;
    if (!domainName) {
      throw new Error("SERVER_URL environment variable is required for SSL");
    }

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      description: "Allow SSH and application traffic",
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(
      ec2.Peer.ipv4(myIp),
      ec2.Port.tcp(22),
      "Allow SSH access from my IP"
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS access from anywhere"
    );
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(myIp),
      ec2.Port.tcp(3001),
      "Allow application port access from my IP for testing"
    );

    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:*"],
        resources: ["*"],
      })
    );

    const keyPair = ec2.KeyPair.fromKeyPairAttributes(this, "KeyPair", {
      keyPairName: process.env.EC2_KEY_PAIR_NAME!,
      type: ec2.KeyPairType.RSA,
    });
    const instance = new ec2.Instance(this, "Instance", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup,
      role,
      keyPair,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    const sslCertificate = new acm.Certificate(this, "Certificate", {
      domainName,
      validation: acm.CertificateValidation.fromDns(),
    });
    const httpsListener = alb.addListener("HttpsListener", {
      port: 443,
      certificates: [sslCertificate],
      protocol: elbv2.ApplicationProtocol.HTTPS,
      open: true,
    });

    // Add target group for the instance
    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "TargetGroup",
      {
        vpc,
        port: 3001,
        protocol: elbv2.ApplicationProtocol.HTTP,
        // targets: [new targets.InstanceTarget(instance)],
        healthCheck: {
          path: "/",
          healthyHttpCodes: "200",
          interval: cdk.Duration.seconds(30),
        },
      }
    );

    httpsListener.addTargetGroups("HttpsTarget", {
      targetGroups: [targetGroup],
    });

    // Redirect HTTP to HTTPS
    alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: true,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });

    new cdk.CfnOutput(this, "InstancePublicIp", {
      value: instance.instancePublicIp,
      description: "Public IP address of the EC2 instance",
    });
    new cdk.CfnOutput(this, "ALBDnsName", {
      value: alb.loadBalancerDnsName,
      description: "DNS name of the Application Load Balancer",
    });
  }
}
