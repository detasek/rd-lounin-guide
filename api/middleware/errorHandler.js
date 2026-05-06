module.exports = (err,req,res,next)=>{
  console.error("API ERROR:", err);

  if (err && err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      success:false,
      error: err.code || 'upload_error'
    });
  }

  if (err && err.message === 'unsupported_file_type') {
    return res.status(400).json({
      success:false,
      error: 'unsupported_file_type'
    });
  }

  res.status(500).json({
    success:false,
    error: err.message || "internal_error"
  });
};
