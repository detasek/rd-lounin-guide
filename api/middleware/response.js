module.exports = (req,res,next)=>{
  res.success = (data)=>{
    res.json({
      success:true,
      data
    });
  };

  next();
};
