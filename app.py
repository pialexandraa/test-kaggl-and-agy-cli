import urllib.request
import ssl
import re
from xml.etree import ElementTree
from flask import Flask, jsonify, render_template, request
from datetime import datetime, timezone

app = Flask(__name__)

# Memory cache for release notes
cache_data = {
    'updates': [],
    'last_updated': None
}

def clean_html(html_str):
    if not html_str:
        return ""
    # Remove HTML tags to get raw text
    text = re.sub(r'<[^>]+>', ' ', html_str)
    # Decode basic HTML entities
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;', "'")
    # Normalize spacing
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_xml_feed(xml_content):
    try:
        root = ElementTree.fromstring(xml_content)
    except Exception as e:
        print(f"Error parsing XML: {e}")
        return []

    # Namespace handling (Atom feeds use the xmlns namespaces)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    entries = root.findall('atom:entry', ns)
    
    parsed_updates = []
    
    for i, entry in enumerate(entries):
        # Extract title (date)
        title_elem = entry.find('atom:title', ns)
        date_str = title_elem.text.strip() if title_elem is not None else "Unknown Date"
        
        # Extract updated timestamp
        updated_elem = entry.find('atom:updated', ns)
        updated_str = updated_elem.text.strip() if updated_elem is not None else ""
        
        # Extract content (HTML)
        content_elem = entry.find('atom:content', ns)
        content_html = content_elem.text if content_elem is not None else ""
        
        if not content_html:
            continue
            
        # Parse content: split on headers (e.g. <h3>Feature</h3>, <h3>Issue</h3>)
        # Use regex to find all matches of <h3>...</h3> tags
        # BigQuery feed typically uses <h3> headings for update types
        header_pattern = re.compile(r'<(h[1-6])>(.*?)</\1>', re.IGNORECASE)
        matches = list(header_pattern.finditer(content_html))
        
        if not matches:
            # If no headings are found, treat the entire content as a single update
            text_desc = clean_html(content_html)
            parsed_updates.append({
                'id': f"up-{i}-0",
                'date': date_str,
                'updated': updated_str,
                'type': 'Update',
                'html': content_html,
                'body_html': content_html,
                'text': text_desc
            })
            continue
            
        # Extract each block between headers
        for idx, match in enumerate(matches):
            tag = match.group(1)
            type_str = match.group(2).strip()
            
            start_pos = match.end()
            end_pos = matches[idx+1].start() if idx + 1 < len(matches) else len(content_html)
            
            sub_html = content_html[start_pos:end_pos].strip()
            text_desc = clean_html(sub_html)
            
            # Sub-update ID includes entry index and sub-item index
            parsed_updates.append({
                'id': f"up-{i}-{idx}",
                'date': date_str,
                'updated': updated_str,
                'type': type_str,
                'html': f"<{tag}>{type_str}</{tag}>\n{sub_html}",
                'body_html': sub_html,
                'text': text_desc
            })
            
    return parsed_updates

def fetch_feed_data():
    feed_url = 'https://docs.cloud.google.com/feeds/bigquery-release-notes.xml'
    
    # We bypass SSL verification since macOS Python installations often fail
    # on SSL context certificates lookup by default.
    ctx = ssl._create_unverified_context()
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    req = urllib.request.Request(feed_url, headers=headers)
    
    with urllib.request.urlopen(req, context=ctx) as response:
        xml_content = response.read()
        
    return xml_content

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    
    # Check if cache exists and is valid (e.g. less than 10 minutes old)
    now = datetime.now(timezone.utc)
    is_cache_valid = (
        cache_data['last_updated'] is not None and 
        (now - cache_data['last_updated']).total_seconds() < 600
    )
    
    if not is_cache_valid or force_refresh:
        try:
            print("Fetching feed from source...")
            xml_data = fetch_feed_data()
            updates = parse_xml_feed(xml_data)
            
            cache_data['updates'] = updates
            cache_data['last_updated'] = now
        except Exception as e:
            print(f"Error fetching/parsing feed: {e}")
            # Fallback to cache if request fails, or return error
            if not cache_data['updates']:
                return jsonify({
                    'error': 'Failed to retrieve release notes feed from server.',
                    'details': str(e)
                }), 500
                
    # Return updates alongside localized update string
    last_updated_str = cache_data['last_updated'].strftime('%Y-%m-%d %H:%M:%S UTC') if cache_data['last_updated'] else "Never"
    return jsonify({
        'updates': cache_data['updates'],
        'last_updated': last_updated_str
    })

if __name__ == '__main__':
    # Running locally in debug mode
    app.run(host='127.0.0.1', port=5000, debug=True)
