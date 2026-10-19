'use client';
import { useState } from 'react';
import { Check,Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

// A week's recap written by the Tuesday Claude routine, with a button to copy it
// into the group chat. Nothing is sent anywhere automatically.
export function Recap({week,text,open=false}:{week:number;text:string;open?:boolean}) {
  const [copied,setCopied]=useState(false);
  const copy=()=>{navigator.clipboard?.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);},()=>setCopied(false));};
  return <details className="paper rounded-xl" open={open}>
    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 font-bold">Week {week} recap<span className="text-sm font-normal text-[var(--ink-2)]">for the group chat</span></summary>
    <div className="border-t border-[var(--rule)] px-4 py-3">
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p>
      <Button type="button" variant="outline" className="mt-3 min-h-10" onClick={copy}>{copied?<Check className="size-4"/>:<Copy className="size-4"/>}{copied?'Copied':'Copy recap'}</Button>
    </div>
  </details>;
}
