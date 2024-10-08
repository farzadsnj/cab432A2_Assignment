const express = require('express');
const router = express.Router();
const auth = require('../auth.js');
const { saveUserActivity, saveFileMetadata, saveProgress, getFileMetadata } = require('../db/database.js'); // Ensure getFileMetadata is imported
const { transcodeVideoWithProgress } = require('../transcode');
<<<<<<< HEAD

// Route for uploading and processing video files
=======
const { listFilesInS3 } = require('./s3_upload.js');

>>>>>>> a2222_repo/main
router.post('/', auth.authenticateToken, async (req, res) => {
  const { fileName } = req.body;
  const username = req.user.username;

  if (!fileName) {
    return res.status(400).json({ error: 'File name is required.' });
  }

  const progressId = `${username}_${Date.now()}`;

  try {
<<<<<<< HEAD
    // Log the user's activity
=======
    // Log the user's activity (await added)
>>>>>>> a2222_repo/main
    await saveUserActivity(username, `Started processing file: ${fileName}`);

    const fileMetadata = {
      fileName,
      size: null, // Assuming you may add file size later
      uploadTime: new Date().toISOString(),
      user: username,
      progressId,
      status: 'uploaded',
    };

    // Save file metadata and initial progress state
<<<<<<< HEAD
    await saveFileMetadata(fileMetadata);
    await saveProgress(progressId, 0, 'started');
=======
    await saveFileMetadata(fileMetadata); // Await to ensure metadata is saved
    await saveProgress(progressId, 0, 'started'); // Await progress save
>>>>>>> a2222_repo/main

    // Start video transcoding with progress tracking
    transcodeVideoWithProgress(fileName, progressId, username)
      .then(() => {
        // Update progress and log activity when transcoding completes
        saveProgress(progressId, 100, 'completed');
        saveUserActivity(username, `Transcoding completed for file: ${fileName}`);
        console.log(`Transcoding completed for ${fileName}`);
      })
      .catch((err) => {
        // Handle transcoding errors
        console.error(`Transcoding failed for ${fileName}:`, err);
        saveProgress(progressId, 0, 'error');
        saveUserActivity(username, `Transcoding failed for file: ${fileName}`);
      });

    res.status(201).json({
      message: 'File metadata saved. Transcoding has started.',
      fileName,
      progressId,
    });
  } catch (err) {
    console.error('Error handling upload:', err);
    res.status(500).json({ error: 'Failed to handle upload.' });
  }
});

<<<<<<< HEAD
// Route to fetch the list of uploaded files and their metadata
=======
>>>>>>> a2222_repo/main
router.get('/files', auth.authenticateToken, async (req, res) => {
  const username = req.user.username;

  try {
<<<<<<< HEAD
    const files = await getFileMetadata(username);
=======
    const files = await listFilesInS3(username); // Fetch files with download URLs
>>>>>>> a2222_repo/main

    // Debugging logs to check if files are being returned
    console.log('Files retrieved for user:', username, files);

    if (!files || files.length === 0) {
      return res.status(200).json({
        message: 'No files uploaded yet.',
        files: [],
      });
    }

    res.status(200).json({
      message: 'Files fetched successfully.',
<<<<<<< HEAD
      files,
=======
      files, // Return files with URLs for front-end use
>>>>>>> a2222_repo/main
    });
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({
      error: 'An internal error occurred while fetching files.',
    });
  }
});

module.exports = router;
