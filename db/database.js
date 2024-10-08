// database.js
const { 
    DynamoDBClient, 
    PutItemCommand, 
    GetItemCommand, 
    QueryCommand, 
    DeleteItemCommand, 
    ScanCommand 
} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const {
    cacheFileMetadata,
    getCachedFileMetadata,
    cacheProgress,
    getCachedProgress,
    initializeMemcachedClient, // Changed from Redis to Memcached
} = require('../redisClient');
const { loadConfig } = require("../config.js");
require("dotenv").config();

let dynamodb;
let dynamoDbDocumentClient;
let config;
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "app_data";
let memcachedClient; // Changed from Redis to Memcached

// Initialize the Memcached client (formerly Redis)
const initializeCache = async () => { 
    memcachedClient = await initializeMemcachedClient(); 
    console.log('Memcached client initialized successfully');
};

// Catch and log initialization errors for Memcached
initializeCache().catch((err) => {
    console.error('Failed to initialize Memcached:', err);
});

// Initialize DynamoDB client
const initializeDynamoDB = async () => {
    try {
        const config = await loadConfig();

        // Fix the undefined credentials issue
        const credentials = {
            accessKeyId: config.awsAccessKeyId,
            secretAccessKey: config.awsSecretAccessKey,
        };

        if (config.awsSessionToken) {
            credentials.sessionToken = config.awsSessionToken;
        }

        dynamodb = new DynamoDBClient({
            region: config.awsRegion,
            credentials: credentials, // Credentials now defined properly
        });

        dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamodb);

        console.log('DynamoDB client initialized successfully');
    } catch (err) {
        console.error('Error initializing DynamoDB client:', err);
        throw new Error('Failed to initialize DynamoDB client.');
    }
};

// Catch and log initialization errors for DynamoDB
initializeDynamoDB().catch((err) => {
    console.error('Failed to initialize DynamoDB:', err);
});

// Save user to DynamoDB
const saveUser = async (username, password, role, callback) => {
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            "user": username,                    
            "username": username,
            "password": password,
            "role": role || "user"
        })
    };

    try {
        await dynamodb.send(new PutItemCommand(params));
        console.log("User data saved to DynamoDB");
        if (typeof callback === "function") callback(null);
    } catch (err) {
        console.error("Error saving user data:", err.stack || err);
        if (typeof callback === "function") callback(err);
    }
};

// Save user activity
const saveUserActivity = async (username, activity) => {
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            "user": username,                     
            "activityId": `ACTIVITY#${Date.now()}`, 
            "activity": activity,
            "timestamp": new Date().toISOString()
        })
    };

    try {
        await dynamodb.send(new PutItemCommand(params));
        console.log(`User activity saved: ${activity} for user ${username}`);
    } catch (err) {
        console.error("Error saving user activity:", err.stack || err);
    }
};

// Get file metadata, using cache first (Memcached)
const getFileMetadata = async (username) => {
    const cachedMetadata = await getCachedFileMetadata(username);
    if (cachedMetadata) {
        console.log("Returning cached file metadata for", username);
        return cachedMetadata;
    }

    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "#user = :user",
        ExpressionAttributeNames: {
            "#user": "user"
        },
        ExpressionAttributeValues: {
            ":user": { S: username }
        }
    };

    try {
        const data = await dynamodb.send(new QueryCommand(params));

        if (!data.Items || data.Items.length === 0) {
            console.log("No files found for user:", username);
            return [];
        }

        const files = data.Items.map(item => unmarshall(item)).filter(item => item.fileName);

        if (files.length > 0) {
            await cacheFileMetadata(username, files);
        }

        return files;
    } catch (err) {
        console.error("Error fetching file metadata:", err.stack || err);
        return [];
    }
};

// Save file metadata to DynamoDB and cache it in Memcached
const saveFileMetadata = async (fileMetadata) => {
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            "user": fileMetadata.user,                    
            "fileName": fileMetadata.fileName,    
            "size": fileMetadata.size,
            "format": fileMetadata.format || null,
            "resolution": fileMetadata.resolution || null,
            "uploadTime": fileMetadata.uploadTime || new Date().toISOString()
        })
    };

    try {
        await dynamodb.send(new PutItemCommand(params));
        console.log("File metadata saved to DynamoDB");

        let existingMetadata = await getCachedFileMetadata(fileMetadata.user);
        if (!existingMetadata) existingMetadata = [];
        existingMetadata.push(fileMetadata);
        await cacheFileMetadata(fileMetadata.user, existingMetadata);

        console.log("File metadata cached in Memcached");
    } catch (err) {
        console.error("Error saving file metadata:", err.stack || err);
    }
};

// Save progress data and cache it in Memcached
const saveProgress = async (username, fileName, progressData) => {
    const cacheKey = `progress:${username}:${fileName}`;
    try {
        const params = {
            TableName: TABLE_NAME,
            Item: marshall({
                user: username,                   
                fileName: fileName, 
                progress: progressData,
                lastUpdated: new Date().toISOString(),
            }),
        };

        await dynamodb.send(new PutItemCommand(params));

        // Cache the progress in Memcached
        await memcachedClient.set(cacheKey, JSON.stringify(progressData), { expires: 3600 }); // 1 hour expiration

        console.log(`Progress data saved for ${username} - ${fileName}`);
    } catch (err) {
        console.error('Error saving progress:', err.stack || err);
    }
};

// Get progress data from Memcached or DynamoDB
const getProgress = async (username, fileName) => {
    const cacheKey = `progress:${username}:${fileName}`;
    try {
        // Try to get progress data from Memcached first
        const cachedProgress = await memcachedClient.get(cacheKey);
        if (cachedProgress) {
            console.log(`Returning cached progress for ${username} - ${fileName}`);
            return JSON.parse(cachedProgress.value.toString());
        }

        const params = {
            TableName: TABLE_NAME,
            Key: {
                user: username,    
            },
        };

        const { Item } = await dynamoDbDocumentClient.send(new GetCommand(params));

        if (Item) {
            await memcachedClient.set(cacheKey, JSON.stringify(Item), { expires: 3600 });
            console.log(`Returning progress data for ${username} - ${fileName}`);
            return Item;
        } else {
            console.log(`No progress data found for ${username} - ${fileName}`);
            return null;
        }
    } catch (err) {
        console.error(`Error fetching progress for ${username} - ${fileName}:`, err);
        return null;
    }
};

// Get all files from DynamoDB
const getAllFiles = async () => {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'attribute_exists(fileName)',
    };

    try {
        const data = await dynamodb.send(new ScanCommand(params));

        if (!data.Items || data.Items.length === 0) {
            console.log('No files found in DynamoDB.');
            return [];
        }

        return data.Items.map(item => unmarshall(item));
    } catch (err) {
        console.error('Error fetching files from DynamoDB:', err.stack || err);
        return [];
    }
};

// Delete file from DynamoDB
const deleteFile = async (username, fileName) => {
    const params = {
        TableName: TABLE_NAME,
        Key: marshall({
            'user': username,                      
            'fileName': fileName,       
        }),
    };

    try {
        await dynamodb.send(new DeleteItemCommand(params));
        console.log(`File metadata deleted for ${fileName} uploaded by ${username}`);
    } catch (err) {
        console.error('Error deleting file metadata:', err.stack || err);
        throw err;
    }
};

// Get all users from DynamoDB
const getAllUsers = async () => {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'attribute_exists(username)',
    };

    try {
        const data = await dynamodb.send(new ScanCommand(params));

        if (!data.Items || data.Items.length === 0) {
            console.log('No users found.');
            return [];
        }

        const users = data.Items.map(item => unmarshall(item));
        const uniqueUsers = {};
        users.forEach(user => {
            if (user.username) {
                uniqueUsers[user.username] = {
                    username: user.username,
                    role: user.role || 'user',
                };
            }
        });

        return Object.values(uniqueUsers);
    } catch (err) {
        console.error('Error fetching all users:', err.stack || err);
        return [];
    }
};

module.exports = {
    saveUser,
    saveUserActivity,
    saveFileMetadata,
    saveProgress,
    getFileMetadata,
    getProgress,
    getAllFiles,
    deleteFile,
    getAllUsers,
};
