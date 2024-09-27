require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mime = require('mime-types'); // For getting the file extension from MIME type
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Initialize S3 client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Initialize express app
const app = express();

// Set up multer for file handling (store files temporarily in memory)
const upload = multer({ storage: multer.memoryStorage() });

// Upload file to S3 function
const uploadFileToS3 = async (fileBuffer, fileName, directoryName, mimetype) => {
    const extension = mime.extension(mimetype) || '';

    // Build the S3 file path
    const s3FilePath = `${directoryName}/${fileName}${extension ? `.${extension}` : ''}`;

    const params = {
        Key: s3FilePath,                     // File path in S3
        Bucket: process.env.AWS_BUCKET_NAME, // S3 bucket name
        Body: fileBuffer,                    // File content
    };

    // Upload file to S3
    const command = new PutObjectCommand(params);

    const response = await s3.send(command);

    if (response.$metadata.httpStatusCode !== 200) {
        throw new Error('Error uploading file to S3');
    }

    // prepare the object url of s3
    response.url = s3FilePath;

    return response;
};

// API endpoint for multiple file upload
app.post('/upload', upload.array('files', 30), async (req, res) => { // Allow up to 10 files
    const files = req.files;  // Access multiple files
    const directoryName = req.body.directoryName;

    if (!files || !directoryName) {
        return res.status(400).json({ error: 'Files and directoryName are required' });
    }

    try {
        // Upload each file to S3 using its original filename
        const uploadPromises = files.map((file) => {
            const originalFileName = file.originalname.split(".")[0]; // Use the original file name
            return uploadFileToS3(file.buffer, originalFileName, directoryName, file.mimetype);
        });

        // Wait for all files to be uploaded
        const uploadResults = await Promise.all(uploadPromises);

        // Return success response with S3 file URLs
        return res.status(200).json({
            message: 'Files uploaded successfully',
            data: uploadResults.map(result => result.url),
        });
    } catch (error) {
        console.error('S3 upload error:', error);
        return res.status(500).json({ error: 'Error uploading to S3' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'An internal server error occurred' });
});

// Start the server
const port = process.env.PORT || 4000;

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
