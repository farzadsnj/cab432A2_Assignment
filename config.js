console.log("Config.js is being loaded");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const {
  SSMClient,
  GetParameterCommand,
} = require("@aws-sdk/client-ssm");
require("dotenv").config();

const awsRegion = process.env.AWS_REGION || "ap-southeast-2";

const secretsManager = new SecretsManagerClient({ region: awsRegion });
const ssmClient = new SSMClient({ region: awsRegion });

const getSecret = async (secretName) => {
  try {
    const data = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    if (data.SecretString) {
      console.log(`Secret ${secretName} fetched successfully.`);
      return JSON.parse(data.SecretString);
    } else {
      console.warn(`Secret ${secretName} contains no secret string.`);
      return {};
    }
  } catch (err) {
    console.error(`Error fetching secret (${secretName}):`, err);
    return {};
  }
};

const getParameter = async (paramName) => {
  try {
    const data = await ssmClient.send(
      new GetParameterCommand({ Name: paramName, WithDecryption: true })
    );
    console.log(`Parameter ${paramName} fetched successfully.`);
    return data.Parameter.Value;
  } catch (err) {
    console.error(`Error fetching parameter (${paramName}):`, err);
    throw new Error(`Failed to fetch parameter: ${paramName}`);
  }
};

const loadConfig = async () => {
  try {
    const secrets = await getSecret(process.env.AWS_SECRETS_NAME);

    const config = {
      awsRegion: awsRegion,
      cognitoClientId: secrets.cognitoClientId || process.env.COGNITO_CLIENT_ID,
      cognitoUserPoolId: secrets.cognitoUserPoolId || process.env.COGNITO_USER_POOL_ID,
      s3BucketName: await getParameter(
        process.env.S3_BUCKET_PARAM_NAME || "/app/s3/n11521147-a2"
      ),
    };

    // Optionally log the configuration (excluding sensitive information)
    console.log("Configuration loaded successfully.");

    return config;
  } catch (error) {
    console.error("Error loading configuration:", error);
    throw new Error("Failed to load configuration.");
  }
};

module.exports = { loadConfig };
