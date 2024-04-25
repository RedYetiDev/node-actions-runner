function globToRegex(glob) {
    const patterns = {
        '*': '([^\\/]+)',
        '**': '(.+\\/)?([^\\/]+)',
        '**/': '(.+\\/)?'
    };

    return new RegExp('^(' + glob
        .replace(/\./g, '\\.')
        .replace(/\*\*$/g, '(.+)')
        .replace(/(?:\*\*\/|\*\*|\*)/g, match => patterns[match] || '') + ')$');
}


class CodeOwners {
    constructor(fileContent) {
        this.owners =
            fileContent
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('#'))
                .map(line => {
                    const [path, owner] = line.split(/\s+/);
                    return { path: globToRegex(path.trim()), owner: owner.trim() };
                });
    }

    getOwners(filePath) {
        const owners = this.owners.filter(({ path, owner }) => {
            return path.test(filePath.startsWith('/') ? filePath : ('/' + filePath));
        })

        return owners.map(({ owner }) => owner);
    }
}

module.exports = CodeOwners;