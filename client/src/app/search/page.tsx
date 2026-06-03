import SearchClient from './SearchClient';

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-main p-6 md:px-8 pt-20">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-mono uppercase tracking-widest font-normal mt-1">Find environmental legislation by category, status, and party</h1>
          {/* just a line separator */}
          <div className="border-b border-border w-full mt-8"></div>
        </div>

        <SearchClient />
      </div>
    </div>
  );
}
