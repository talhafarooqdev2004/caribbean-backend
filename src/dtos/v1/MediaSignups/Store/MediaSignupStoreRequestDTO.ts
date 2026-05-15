export class MediaSignupStoreRequestDTO {
    readonly requestId: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly publicationName: string;
    readonly role: string;
    readonly coverageArea: string;
    readonly region: string;
    readonly website: string;
    readonly notes: string;

    constructor(data) {
        this.requestId = data.requestId;
        this.firstName = data.firstName;
        this.lastName = data.lastName;
        this.email = data.email;
        this.publicationName = data.publicationName;
        this.role = data.role;
        this.coverageArea = data.coverageArea || '';
        this.region = data.region;
        this.website = data.website || '';
        this.notes = data.notes || '';
    }

    toPersistence() {
        return {
            requestId: this.requestId,
            firstName: this.firstName,
            lastName: this.lastName,
            email: this.email,
            publicationName: this.publicationName,
            role: this.role,
            coverageArea: this.coverageArea,
            region: this.region,
            website: this.website,
            notes: this.notes,
        };
    }
}
