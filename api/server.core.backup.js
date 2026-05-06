const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(express.json());

const db = new sqlite3.Database('/data/db.sqlite');

// HEALTH
app.get('/api/health', (req,res)=>{
  res.json({status:'ok'});
});

// RECEIPTS LIST
app.get('/api/receipts', (req,res)=>{
  db.all("SELECT * FROM receipts ORDER BY id DESC", [], (err,rows)=>{
    if(err) return res.status(500).json(err);
    res.json(rows);
  });
});

// UPDATE RECEIPT (warranty ready)
app.put('/api/receipts/:id', (req,res)=>{
  const id = req.params.id;
  const b = req.body;

  db.run(`
    UPDATE receipts SET
      title=?,
      supplier=?,
      document_number=?,
      purchase_date=?,
      total_amount=?,
      warranty_months=?,
      warranty_until=?,
      warranty_note=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `, [
    b.title || null,
    b.supplier || null,
    b.document_number || null,
    b.purchase_date || null,
    b.total_amount || null,
    b.warranty_months || null,
    b.warranty_until || null,
    b.warranty_note || null,
    id
  ], (err)=>{
    if(err) return res.status(500).json(err);
    res.json({success:true});
  });
});

// DELETE
app.delete('/api/receipts/:id', (req,res)=>{
  db.run("DELETE FROM receipts WHERE id=?", [req.params.id], (err)=>{
    if(err) return res.status(500).json(err);
    res.json({success:true});
  });
});

app.listen(3000, ()=>{
  console.log("rd-lounin-api RUNNING");
});
