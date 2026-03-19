'use client';

import { Download, ExternalLink, FileText } from 'lucide-react';
import { PageHeader } from '../../../components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';

const handbookPath = '/docs/medicine-counting-machine-handbook.pdf';

export default function HandbookPage() {
  return (
    <div className='space-y-6'>
      <PageHeader
        title='Machine Handbook'
        description='Read the medicine counting machine handbook directly inside the dashboard.'
        actions={
          <>
            <a
              href={handbookPath}
              target='_blank'
              rel='noreferrer'
              className='inline-flex h-10 items-center justify-center rounded-md bg-slate-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800'
            >
              <ExternalLink className='mr-2 h-4 w-4' />
              Open In New Tab
            </a>
            <a
              href={handbookPath}
              download
              className='inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90'
            >
              <Download className='mr-2 h-4 w-4' />
              Download PDF
            </a>
          </>
        }
      />

      <Card className='border-slate-200'>
        <CardHeader>
          <CardTitle>Reader</CardTitle>
          <CardDescription>
            If your browser does not render the PDF inline, use the buttons above to open or download the handbook.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-sky-50 p-4'>
            <div className='flex items-start gap-3'>
              <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white'>
                <FileText className='h-5 w-5' />
              </div>
              <div>
                <p className='font-semibold text-slate-900'>Medicine Counting Machine Handbook</p>
                <p className='mt-1 text-sm text-slate-600'>
                  Embedded from the local PDF you provided so operators can read it without leaving the website.
                </p>
              </div>
            </div>
          </div>

          <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
            <iframe
              title='Medicine Counting Machine Handbook'
              src={`${handbookPath}#toolbar=1&navpanes=0&view=FitH`}
              className='h-[78vh] w-full'
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
