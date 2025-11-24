import React, { useState } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle } from 'lucide-react';

const CertificateUpload = ({ onUploadSuccess, existingCertId = null }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [caCert, setCaCert] = useState(null);
    const [clientCert, setClientCert] = useState(null);
    const [clientKey, setClientKey] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleFileChange = (setter) => (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file extension
            if (!file.name.match(/\.(pem|crt|key|cer)$/i)) {
                setError('Please select a valid certificate file (.pem, .crt, .key, .cer)');
                return;
            }
            setter(file);
            setError('');
        }
    };

    const handleUpload = async () => {
        if (!name && !existingCertId) {
            setError('Please enter a certificate name');
            return;
        }

        if (!caCert && !clientCert && !clientKey && !existingCertId) {
            setError('Please select at least one certificate file');
            return;
        }

        setUploading(true);
        setError('');
        setSuccess('');

        try {
            const formData = new FormData();
            if (name) formData.append('name', name);
            if (description) formData.append('description', description);
            if (caCert) formData.append('ca_cert', caCert);
            if (clientCert) formData.append('client_cert', clientCert);
            if (clientKey) formData.append('client_key', clientKey);

            const { uploadCertificate, updateCertificate } = await import('../services/api');

            if (existingCertId) {
                await updateCertificate(existingCertId, formData);
                setSuccess('Certificate updated successfully!');
            } else {
                await uploadCertificate(formData);
                setSuccess('Certificate uploaded successfully!');
            }

            // Reset form
            setName('');
            setDescription('');
            setCaCert(null);
            setClientCert(null);
            setClientKey(null);

            if (onUploadSuccess) {
                onUploadSuccess();
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to upload certificate');
        } finally {
            setUploading(false);
        }
    };

    const FileInput = ({ label, file, onChange, accept = ".pem,.crt,.key,.cer" }) => (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary">{label}</label>
            <div className="relative">
                <input
                    type="file"
                    accept={accept}
                    onChange={onChange}
                    className="hidden"
                    id={`file-${label.replace(/\s/g, '-')}`}
                />
                <label
                    htmlFor={`file-${label.replace(/\s/g, '-')}`}
                    className="flex items-center gap-2 px-4 py-3 bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl cursor-pointer hover:bg-surfaceHighlight/30 transition-colors"
                >
                    {file ? (
                        <>
                            <FileText size={16} className="text-primary" />
                            <span className="text-white text-sm flex-1">{file.name}</span>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    onChange({ target: { files: [] } });
                                }}
                                className="text-text-secondary hover:text-white"
                            >
                                <X size={16} />
                            </button>
                        </>
                    ) : (
                        <>
                            <Upload size={16} className="text-text-secondary" />
                            <span className="text-text-secondary text-sm">Choose file...</span>
                        </>
                    )}
                </label>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {!existingCertId && (
                <>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                            Certificate Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., mqtt_broker_prod"
                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                            Description
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description"
                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary"
                        />
                    </div>
                </>
            )}

            <FileInput
                label="CA Certificate"
                file={caCert}
                onChange={handleFileChange(setCaCert)}
            />

            <FileInput
                label="Client Certificate"
                file={clientCert}
                onChange={handleFileChange(setClientCert)}
            />

            <FileInput
                label="Client Private Key"
                file={clientKey}
                onChange={handleFileChange(setClientKey)}
            />

            {error && (
                <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {success && (
                <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-lg text-success text-sm">
                    <CheckCircle size={16} />
                    {success}
                </div>
            )}

            <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full px-4 py-3 bg-primary hover:bg-primary/80 disabled:bg-surfaceHighlight/30 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
                {uploading ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {existingCertId ? 'Updating...' : 'Uploading...'}
                    </>
                ) : (
                    <>
                        <Upload size={16} />
                        {existingCertId ? 'Update Certificate' : 'Upload Certificate'}
                    </>
                )}
            </button>
        </div>
    );
};

export default CertificateUpload;
