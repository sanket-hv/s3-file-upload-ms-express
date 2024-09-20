require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mime = require('mime-types'); // For getting the file extension from MIME type
const { S3Client,
    PutObjectCommand } = require('@aws-sdk/client-s3');

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
    // Extract the file extension using the MIME type
    const extension = mime.extension(mimetype) || '';

    // Build the S3 file path
    const s3FilePath = `${directoryName}/${Date.now()}_${fileName}${extension ? `.${extension}` : ''}`;

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
    response.url = `https://s3.${process.env.AWS_REGION}.amazonaws.com/${process.env.AWS_BUCKET_NAME}/${s3FilePath}`;

    return response;
};

// API endpoint for file upload
app.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    const directoryName = req.body.directoryName;
    const fileName = req.body.fileName;

    if (!file || !directoryName || !fileName) {
        return res.status(400).json({ error: 'File, directoryName, and fileName are required' });
    }

    try {
        // Upload file to S3 with automatic file extension detection
        const data = await uploadFileToS3(file.buffer, fileName, directoryName, file.mimetype);

        // Return success response with S3 file URL
        return res.status(200).json({
            message: 'File uploaded successfully',
            data: data,
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
