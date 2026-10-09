import { getOdds, oddsSports } from '@/lib/odds';
export async function GET(request:Request) {
  const sport=new URL(request.url).searchParams.get('sport')||'';
  if(!sport)return Response.json({sports:oddsSports},{headers:{'Cache-Control':'no-store'}});
  try{
    const board=await getOdds(sport);
    if(!board)return Response.json({error:'Unknown sport.'},{status:404});
    return Response.json(board,{headers:{'Cache-Control':'no-store'}});
  }catch{console.error('odds_read_failed');return Response.json({error:'FanDuel lines are unavailable right now. Enter your pick manually.'},{status:503});}
}
