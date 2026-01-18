import SearchClient from './SearchClient';

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-main p-8 pt-20">
      <div className="max-w-4xl mx-auto">
        {/* Page Header - Rendered on server */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-main mb-2">Search Bills</h1>
          <p className="text-light">Find environmental legislation by category, status, and party</p>
        </div>

        {/* Interactive Search - Client Component */}
        <SearchClient />
      </div>
    </div>
  );
}
