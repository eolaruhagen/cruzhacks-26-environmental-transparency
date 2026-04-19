import SearchClient from './SearchClient';

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-main p-8 pt-20">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="wf-label mb-2">Search</p>
          <h1 className="text-3xl font-bold text-main">Bills</h1>
          <p className="text-light text-sm mt-1">Find environmental legislation by category, status, and party</p>
        </div>

        <SearchClient />
      </div>
    </div>
  );
}
