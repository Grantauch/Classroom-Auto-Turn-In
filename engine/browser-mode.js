function shouldRunHeadless(env=process.env){
  return String(env.CATI_BACKGROUND_MODE||'')==='1' && String(env.CATI_FORCE_VISIBLE||'')!=='1';
}
module.exports={shouldRunHeadless};
