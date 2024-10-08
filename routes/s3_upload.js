const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { loadConfig } = require('../config.js');
const fs = require('fs');
const path = require('path');

let s3Client;
let bucketName;

// Initialize S3 Client
const initializeS3 = async () => {
  try {
    const config = await loadConfig();
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
    });
    bucketName = config.s3BucketName;
    console.log('S3 client initialized successfully.');
  } catch (err) {
    console.error('Error initializing S3 client:', err);
    throw err;
  }
};

initializeS3();

// Upload to S3
const uploadToS3 = async (filePath, username) => {
  let s3Key;
  try {
    const normalizedFilePath = path.normalize(filePath);

    if (!fs.existsSync(normalizedFilePath)) {
      throw new Error('File path is invalid or file does not exist');
    }

    const fileContent = fs.readFileSync(normalizedFilePath);
    const fileName = path.basename(normalizedFilePath);
    s3Key = `${username}/${fileName}`;

    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      Body: fileContent,
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    console.log(`File uploaded to S3 successfully: ${s3Key}`);
    return fileName;
  } catch (err) {
    console.error('Error uploading to S3:', err);
    throw new Error('Upload to S3 failed');
  }
};

// Generate presigned upload URL
const generatePresignedUploadUrl = async (fileName, username) => {
  try {
    const s3Key = `${username}/${fileName}`;
    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      ContentType: 'application/octet-stream',
    };

    const command = new PutObjectCommand(uploadParams);
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return url;
  } catch (err) {
    console.error('Error generating presigned upload URL:', err);
    throw new Error('Failed to generate upload URL');
  }
};

// Generate presigned download URL
const generatePresignedDownloadUrl = async (fileName, username) => {
  try {
    const s3Key = `${username}/${fileName}`;
    const downloadParams = {
      Bucket: bucketName,
      Key: s3Key,
    };

    const command = new GetObjectCommand(downloadParams);
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return url;
  } catch (err) {
    console.error('Error generating download URL:', err);
    throw new Error('Failed to generate download URL');
  }
};

// Retrieve a file from S3
const getObjectFromS3 = async (fileName, username) => {
  try {
    const s3Key = `${username}/${fileName}`;
    const downloadParams = {
      Bucket: bucketName,
      Key: s3Key,
    };

    const command = new GetObjectCommand(downloadParams);
    const data = await s3Client.send(command);

    return data;
  } catch (err) {
    console.error('Error fetching object from S3:', err);
    throw new Error('Failed to fetch object from S3');
  }
};

// List files in S3 for a specific user
const listFilesInS3 = async (username) => {
  try {
    const listParams = {
      Bucket: bucketName,
      Prefix: `${username}/`,
    };

    const command = new ListObjectsV2Command(listParams);
    const response = await s3Client.send(command);

    // Generate signed URLs for each file for downloading
    const files = await Promise.all(
      response.Contents.map(async (file) => {
        const downloadUrl = await generatePresignedDownloadUrl(file.Key, username);
        return {
          fileName: file.Key.split('/').pop(),
          downloadUrl,
        };
      })
    );

    return files;
  } catch (err) {
    console.error('Error listing files in S3:', err);
    throw new Error('Failed to list files in S3');
  }
};

module.exports = {
  uploadToS3,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  getObjectFromS3, // Make sure this function is exported
  listFilesInS3,
};
